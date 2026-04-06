import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHECK_POLICIES_KEY } from '../decorators/check-policies.decorator';
import { CaslAbilityFactory } from '../casl-ability.factory';
import { IPolicyHandler } from '../interfaces/policy-handler.interface';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policyHandlers = this.reflector.get<IPolicyHandler[]>(
      CHECK_POLICIES_KEY,
      context.getHandler(),
    );

    // No @CheckPolicies() decorator → allow (other guards handle auth)
    if (!policyHandlers || policyHandlers.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    const ability = this.caslAbilityFactory.createForUser(user);

    return policyHandlers.every(handler => handler.handle(ability));
  }
}
