import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Cache } from 'cache-manager';
import mongoose from 'mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from 'src/users/user.interface';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { Skill, SkillDocument } from './schemas/skill.schema';

type NormalizedExtractedSkills = {
  normalizedSkills: string[];
  unmappedSkills: string[];
};

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  private readonly CATALOG_CACHE_KEY = 'skills:catalog';
  private readonly ALIAS_MAP_CACHE_KEY = 'skills:alias-map';
  private readonly CACHE_TTL = 1800000;
  private readonly DEFAULT_CATALOG_LIMIT = 100;

  constructor(
    @InjectModel(Skill.name)
    private readonly skillModel: SoftDeleteModel<SkillDocument>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(createSkillDto: CreateSkillDto, user: IUser) {
    const payload = this.buildSkillPayload(createSkillDto);
    await this.assertUniqueSkill(payload.label, payload.slug);

    const newSkill = await this.skillModel.create({
      ...payload,
      createdBy: { _id: user._id, email: user.email },
    });

    await this.invalidateCache();
    return { _id: newSkill._id, createdAt: newSkill.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string) {
    const { filter, sort, projection } = aqp(query);
    delete filter.page;
    delete filter.limit;

    filter.isDeleted = { $ne: true };

    const safePage = page > 0 ? page : 1;
    const safeLimit = limit > 0 ? Math.min(limit, 100) : 10;
    const offset = (safePage - 1) * safeLimit;

    const totalItems = await this.skillModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / safeLimit);

    const result = await this.skillModel
      .find(filter)
      .skip(offset)
      .limit(safeLimit)
      .sort(sort as any)
      .select(projection as any)
      .lean()
      .exec();

    return {
      result,
      meta: {
        pagination: {
          current_page: safePage,
          per_page: safeLimit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string) {
    this.validateObjectId(id);

    const skill = await this.skillModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .lean()
      .exec();
    if (!skill) {
      throw new NotFoundException(`Skill with id ${id} not found`);
    }

    return skill;
  }

  async update(id: string, updateSkillDto: UpdateSkillDto, user: IUser) {
    this.validateObjectId(id);

    const existingSkill = await this.skillModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .exec();
    if (!existingSkill) {
      throw new NotFoundException(`Skill with id ${id} not found`);
    }

    const payload = this.buildSkillPayload({
      label: updateSkillDto.label ?? existingSkill.label,
      aliases: updateSkillDto.aliases ?? existingSkill.aliases,
      category: updateSkillDto.category ?? existingSkill.category,
      description: updateSkillDto.description ?? existingSkill.description,
      isActive: updateSkillDto.isActive ?? existingSkill.isActive,
    });

    await this.assertUniqueSkill(payload.label, payload.slug, id);

    await this.skillModel.updateOne(
      { _id: id },
      {
        ...payload,
        updatedBy: { _id: user._id, email: user.email },
      },
    );

    await this.invalidateCache();
    return this.findOne(id);
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);

    const existingSkill = await this.skillModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .lean();
    if (!existingSkill) {
      throw new NotFoundException(`Skill with id ${id} not found`);
    }

    await this.skillModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );

    await this.skillModel.softDelete({ _id: id });
    await this.invalidateCache();

    return { _id: id, deleted: true };
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    const result = await bulkSoftDelete(this.skillModel, ids, user);
    await this.invalidateCache();
    return result;
  }

  async getCatalog(search?: string, limit?: number) {
    const trimmedSearch = this.normalizeWhitespace(search);
    const normalizedLimit = limit > 0 ? Math.min(limit, 200) : this.DEFAULT_CATALOG_LIMIT;

    if (!trimmedSearch && normalizedLimit === this.DEFAULT_CATALOG_LIMIT) {
      const cached = await this.cacheManager.get(this.CATALOG_CACHE_KEY);
      if (cached) {
        return cached;
      }
    }

    const filter: Record<string, any> = {
      isActive: true,
      isDeleted: { $ne: true },
    };

    if (trimmedSearch) {
      const escapedSearch = this.escapeRegex(trimmedSearch);
      filter.$or = [
        { label: { $regex: escapedSearch, $options: 'i' } },
        { aliases: { $regex: escapedSearch, $options: 'i' } },
        { slug: { $regex: escapedSearch, $options: 'i' } },
        { category: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const skills = await this.skillModel
      .find(filter)
      .sort({ label: 1 })
      .limit(normalizedLimit)
      .select('label slug aliases category description')
      .lean()
      .exec();

    if (!trimmedSearch && normalizedLimit === this.DEFAULT_CATALOG_LIMIT) {
      await this.cacheManager.set(this.CATALOG_CACHE_KEY, skills, this.CACHE_TTL);
    }

    return skills;
  }

  async getAliasMap(forceRefresh = false): Promise<Record<string, string>> {
    if (!forceRefresh) {
      const cached = await this.cacheManager.get<Record<string, string>>(this.ALIAS_MAP_CACHE_KEY);
      if (cached) {
        return cached;
      }
    }

    const skills = await this.skillModel
      .find({ isActive: true, isDeleted: { $ne: true } })
      .select('label aliases')
      .lean()
      .exec();

    const aliasMap = skills.reduce<Record<string, string>>((accumulator, skill) => {
      accumulator[this.normalizeForLookup(skill.label)] = skill.label;

      for (const alias of skill.aliases ?? []) {
        accumulator[this.normalizeForLookup(alias)] = skill.label;
      }

      return accumulator;
    }, {});

    await this.cacheManager.set(this.ALIAS_MAP_CACHE_KEY, aliasMap, this.CACHE_TTL);
    return aliasMap;
  }

  async normalizeControlledSkills(skills: string[]): Promise<string[]> {
    if (!Array.isArray(skills) || skills.length === 0) {
      return [];
    }

    const aliasMap = await this.getAliasMap();
    const normalizedSkills: string[] = [];
    const unknownSkills: string[] = [];
    const seenSkills = new Set<string>();

    for (const skill of skills) {
      const normalizedInput = this.normalizeForLookup(skill);
      if (!normalizedInput) continue;

      const canonicalLabel = aliasMap[normalizedInput];
      if (!canonicalLabel) {
        unknownSkills.push(this.normalizeWhitespace(skill));
        continue;
      }

      if (seenSkills.has(canonicalLabel)) continue;
      seenSkills.add(canonicalLabel);
      normalizedSkills.push(canonicalLabel);
    }

    if (unknownSkills.length > 0) {
      throw new BadRequestException(
        `Unknown skills: ${unknownSkills.join(', ')}. Please use active skills from the catalog.`,
      );
    }

    return normalizedSkills;
  }

  async normalizeExtractedSkills(skills: string[]): Promise<NormalizedExtractedSkills> {
    if (!Array.isArray(skills) || skills.length === 0) {
      return { normalizedSkills: [], unmappedSkills: [] };
    }

    const aliasMap = await this.getAliasMap();
    const normalizedSkills: string[] = [];
    const unmappedSkills: string[] = [];
    const seenNormalized = new Set<string>();
    const seenUnmapped = new Set<string>();

    for (const skill of skills) {
      const normalizedInput = this.normalizeForLookup(skill);
      if (!normalizedInput) continue;

      const canonicalLabel = aliasMap[normalizedInput];
      if (!canonicalLabel) {
        const cleanedSkill = this.normalizeWhitespace(skill);
        if (!seenUnmapped.has(cleanedSkill)) {
          seenUnmapped.add(cleanedSkill);
          unmappedSkills.push(cleanedSkill);
        }
        continue;
      }

      if (seenNormalized.has(canonicalLabel)) continue;
      seenNormalized.add(canonicalLabel);
      normalizedSkills.push(canonicalLabel);
    }

    return { normalizedSkills, unmappedSkills };
  }

  private async assertUniqueSkill(label: string, slug: string, currentId?: string): Promise<void> {
    const duplicate = await this.skillModel
      .findOne({
        isDeleted: { $ne: true },
        ...(currentId ? { _id: { $ne: currentId } } : {}),
        $or: [{ label }, { slug }],
      })
      .select('_id label slug')
      .lean()
      .exec();

    if (duplicate) {
      throw new BadRequestException(
        `Skill '${label}' conflicts with existing catalog entry '${duplicate.label}'.`,
      );
    }
  }

  private buildSkillPayload(skillDto: CreateSkillDto) {
    const label = this.normalizeWhitespace(skillDto.label);
    const aliases = (skillDto.aliases ?? [])
      .map(alias => this.normalizeWhitespace(alias))
      .filter(Boolean)
      .filter(alias => this.normalizeForLookup(alias) !== this.normalizeForLookup(label))
      .filter((alias, index, self) => self.indexOf(alias) === index);

    return {
      label,
      slug: this.buildSlug(label),
      aliases,
      category: this.normalizeWhitespace(skillDto.category),
      description: this.normalizeWhitespace(skillDto.description),
      isActive: skillDto.isActive,
    };
  }

  private buildSlug(label: string): string {
    return label
      .toLowerCase()
      .replace(/\+/g, ' plus ')
      .replace(/#/g, ' sharp ')
      .replace(/\./g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private normalizeForLookup(value?: string): string {
    return this.normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[^\w\s+#.]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeWhitespace(value?: string): string {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Skill with id = ${id}`);
    }
  }

  private async invalidateCache(): Promise<void> {
    await Promise.all([
      this.cacheManager.del(this.CATALOG_CACHE_KEY),
      this.cacheManager.del(this.ALIAS_MAP_CACHE_KEY),
    ]);
    this.logger.debug('Skills catalog cache invalidated');
  }
}
