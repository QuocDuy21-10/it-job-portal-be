import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { SkillsService } from './skills.service';
import { Skill } from './schemas/skill.schema';

describe('SkillsService', () => {
  let service: SkillsService;
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let skillModel: {
    find: jest.Mock;
  };

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    skillModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: getModelToken(Skill.name), useValue: skillModel },
      ],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
  });

  describe('normalizeControlledSkills', () => {
    it('maps aliases to canonical labels and removes duplicates', async () => {
      cacheManager.get.mockResolvedValue({
        node: 'Node.js',
        nodejs: 'Node.js',
        'node.js': 'Node.js',
        nestjs: 'NestJS',
      });

      const result = await service.normalizeControlledSkills(['node', 'nestjs', 'nodejs']);

      expect(result).toEqual(['Node.js', 'NestJS']);
      expect(cacheManager.get).toHaveBeenCalledWith('skills:alias-map');
    });

    it('throws when an unknown skill is provided on a controlled write', async () => {
      cacheManager.get.mockResolvedValue({ typescript: 'TypeScript' });

      await expect(
        service.normalizeControlledSkills(['TypeScript', 'UnknownSkill']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('normalizeExtractedSkills', () => {
    it('splits canonicalized skills from unmapped parsed skills', async () => {
      cacheManager.get.mockResolvedValue({
        js: 'JavaScript',
        javascript: 'JavaScript',
        react: 'React',
      });

      const result = await service.normalizeExtractedSkills(['JS', 'React', 'Bun']);

      expect(result).toEqual({
        normalizedSkills: ['JavaScript', 'React'],
        unmappedSkills: ['Bun'],
      });
    });
  });

  describe('getAliasMap', () => {
    it('builds and caches the alias map from active catalog entries when cache is cold', async () => {
      cacheManager.get.mockResolvedValue(undefined);

      const exec = jest.fn().mockResolvedValue([
        { label: 'Node.js', aliases: ['node', 'nodejs'] },
        { label: 'TypeScript', aliases: ['ts'] },
      ]);

      skillModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec }),
        }),
      });

      const result = await service.getAliasMap();

      expect(result).toEqual({
        'node.js': 'Node.js',
        node: 'Node.js',
        nodejs: 'Node.js',
        typescript: 'TypeScript',
        ts: 'TypeScript',
      });
      expect(cacheManager.set).toHaveBeenCalledWith('skills:alias-map', result, 1800000);
    });
  });
});
