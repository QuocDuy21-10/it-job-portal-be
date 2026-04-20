import { AbilityBuilder, PureAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { EAction } from './enums/action.enum';
import { ERole } from './enums/role.enum';
import { IUser } from 'src/users/user.interface';

export type ESubject =
  | 'Job'
  | 'Company'
  | 'Resume'
  | 'User'
  | 'Role'
  | 'Permission'
  | 'CvProfile'
  | 'Subscriber'
  | 'Chat'
  | 'File'
  | 'Notification'
  | 'Statistic'
  | 'all';

export type AppAbility = PureAbility<[EAction, ESubject]>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: IUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(PureAbility);
    const roleName = user.role?.name;

    switch (roleName) {
      case ERole.SUPER_ADMIN:
        can(EAction.MANAGE, 'all');
        break;

      case ERole.HR:
        // Jobs: HR can manage jobs
        can(EAction.CREATE, 'Job');
        can(EAction.READ, 'Job');
        can(EAction.UPDATE, 'Job');
        can(EAction.DELETE, 'Job');

        // Company: HR can read all, update their own (enforced in service layer)
        can(EAction.READ, 'Company');
        can(EAction.UPDATE, 'Company');

        // Resumes: HR can read, update status, and delete (review + manage applications)
        can(EAction.READ, 'Resume');
        can(EAction.UPDATE, 'Resume');
        can(EAction.DELETE, 'Resume');

        // Chat, CvProfile, Subscriber, Notification, File
        can(EAction.MANAGE, 'Chat');
        can(EAction.MANAGE, 'CvProfile');
        can(EAction.MANAGE, 'Subscriber');
        can(EAction.MANAGE, 'Notification');
        can(EAction.MANAGE, 'File');

        // Statistics: read only
        can(EAction.READ, 'Statistic');
        break;

      case ERole.NORMAL_USER:
        // Jobs: read only
        can(EAction.READ, 'Job');

        // Companies: read only
        can(EAction.READ, 'Company');

        // Resumes: user can create (apply) and read their own (enforced in service layer)
        can(EAction.CREATE, 'Resume');
        can(EAction.READ, 'Resume');

        // CvProfile: manage their own
        can(EAction.MANAGE, 'CvProfile');

        // Chat, Subscriber, Notification
        can(EAction.MANAGE, 'Chat');
        can(EAction.MANAGE, 'Subscriber');
        can(EAction.MANAGE, 'Notification');
        can(EAction.MANAGE, 'File');
        break;

      default:
        // No permissions for unknown roles
        break;
    }

    return build();
  }
}
