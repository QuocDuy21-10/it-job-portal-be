import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { IUser } from 'src/users/user.interface';
import { Role, RoleDocument } from './schemas/role.schema';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import aqp from 'api-query-params';
import { ERole } from 'src/casl/enums/role.enum';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private roleModel: SoftDeleteModel<RoleDocument>,
    @InjectModel(User.name) private userModel: SoftDeleteModel<UserDocument>,
  ) {}
  async create(createRoleDto: CreateRoleDto, user: IUser) {
    const { name, description, isActive } = createRoleDto;
    const existingName = await this.roleModel.findOne({
      name,
      isDeleted: false,
    });
    if (existingName) {
      throw new BadRequestException(
        `Role with name '${name}' already exists. Please choose a different name.`,
      );
    }
    // create new permission
    const newRole = await this.roleModel.create({
      name,
      description,
      isActive,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });
    return { _id: newRole?._id, createdAt: newRole?.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string) {
    const { filter, sort, population, projection } = aqp(query);
    delete filter.page;
    delete filter.limit;
    const offset = (page - 1) * limit;
    const defaultLimit = limit ? limit : 10;

    const totalItems = (await this.roleModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.roleModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .select(projection as any)
      .exec();
    return {
      result,
      meta: {
        pagination: {
          current_page: page,
          per_page: limit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string) {
    this.validateObjectId;
    return await this.roleModel.findById(id);
  }

  async update(id: string, updateRoleDto: UpdateRoleDto, user: IUser) {
    this.validateObjectId(id);
    return await this.roleModel.updateOne(
      { _id: id },
      {
        ...updateRoleDto,
        updatedBy: { _id: user._id, email: user.email },
      },
    );
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    const roleAdmin = await this.roleModel.findOne({ _id: id });
    if (roleAdmin.name === ERole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot delete admin role');
    }
    await this.roleModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.roleModel.softDelete({ _id: id });
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));

    // Prevent deleting the SUPER_ADMIN role
    const adminRole = await this.roleModel
      .findOne({ name: ERole.SUPER_ADMIN, _id: { $in: objectIds } })
      .select('_id')
      .lean();

    if (adminRole) {
      throw new BadRequestException('Cannot delete the SUPER ADMIN role');
    }

    // Prevent deleting roles that still have active users assigned
    const activeUserCount = await this.userModel.countDocuments({
      role: { $in: objectIds },
      isDeleted: { $ne: true },
    });

    if (activeUserCount > 0) {
      throw new BadRequestException(
        `Cannot delete roles with active users assigned (${activeUserCount} user(s) affected). Reassign users first.`,
      );
    }

    return bulkSoftDelete(this.roleModel, ids, user);
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Role with id = ${id}`);
    }
  }
}
