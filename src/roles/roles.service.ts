import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { IUser } from 'src/users/users.interface';
import { Role, RoleDocument } from './schemas/role.schema';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import aqp from 'api-query-params';

@Injectable()
export class RolesService {
  constructor(@InjectModel(Role.name) private roleModel: SoftDeleteModel<RoleDocument>) {}
  async create(createRoleDto: CreateRoleDto, user: IUser) {
    const { name, description, isActive, permissions } = createRoleDto;
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
      permissions,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });
    return { _id: newRole?._id, createdAt: newRole?.createdAt };
  }

  async findAll(currentPage?: number, limit?: number, query?: string) {
    const { filter, sort, population, projection } = aqp(query);
    delete filter.current;
    delete filter.pageSize;
    let offset = (currentPage - 1) * limit;
    let defaultLimit = limit ? limit : 10;

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
        current: currentPage,
        pageSize: limit,
        totalPages,
        totalItems,
      },
    };
  }

  findOne(id: string) {
    this.validateObjectId;
    return this.roleModel.findById(id).populate({
      path: 'permissions',
      select: {
        _id: 1,
        name: 1,
        apiPath: 1,
        method: 1,
      },
    });
  }

  async update(id: string, updateRoleDto: UpdateRoleDto, user: IUser) {
    this.validateObjectId(id);
    const { name, description, isActive, permissions } = updateRoleDto;
    // check existing name
    const existingName = await this.roleModel.findOne({
      _id: { $ne: id },
      name,
      isDeleted: false,
    });
    if (existingName) {
      throw new BadRequestException(
        `Role with name '${name}' already exists. Please choose a different name.`,
      );
    }
    return await this.roleModel.updateOne(
      { _id: id },
      {
        name,
        description,
        isActive,
        permissions,
        updatedBy: { _id: user._id, email: user.email },
      },
    );
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    await this.roleModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.roleModel.softDelete({ _id: id });
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Role with id = ${id}`);
    }
  }
}
