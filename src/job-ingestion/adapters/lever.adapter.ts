import { Injectable } from '@nestjs/common';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { IAtsAdapter, IRawAtsJob } from './ats-adapter.interface';
import { assertBoardToken, fetchAtsJson } from './ats-http';

@Injectable()
export class LeverAdapter implements IAtsAdapter {
  readonly provider = EJobSourceProvider.LEVER;

  async fetchJobs(boardToken: string): Promise<IRawAtsJob[]> {
    const token = assertBoardToken(boardToken);
    const body = await fetchAtsJson(`https://api.lever.co/v0/postings/${token}?mode=json`);

    if (!Array.isArray(body)) {
      throw new Error(`Unexpected Lever response for site ${token}`);
    }

    return body.map(
      (posting): IRawAtsJob => ({
        externalId: posting.id ?? '',
        title: posting.text?.trim() ?? '',
        location: posting.categories?.location ?? '',
        country: posting.country,
        isRemoteHint: posting.workplaceType === 'remote',
        sourceUrl: posting.hostedUrl ?? '',
        applyUrl: posting.applyUrl,
        descriptionHtml: this.buildDescriptionHtml(posting),
        publishedAt:
          typeof posting.createdAt === 'number' ? new Date(posting.createdAt) : undefined,
      }),
    );
  }

  private buildDescriptionHtml(posting: any): string {
    const lists = (posting.lists ?? []).map(
      (list: { text: string; content: string }) => `<h3>${list.text}</h3><ul>${list.content}</ul>`,
    );

    return [posting.description, ...lists, posting.additional].filter(Boolean).join('');
  }
}
