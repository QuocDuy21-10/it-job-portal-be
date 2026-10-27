import { Injectable } from '@nestjs/common';
import { decode } from 'he';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { IAtsAdapter, IRawAtsJob } from './ats-adapter.interface';
import { assertBoardToken, fetchAtsJson } from './ats-http';

@Injectable()
export class GreenhouseAdapter implements IAtsAdapter {
  readonly provider = EJobSourceProvider.GREENHOUSE;

  async fetchJobs(boardToken: string): Promise<IRawAtsJob[]> {
    const token = assertBoardToken(boardToken);
    const body = await fetchAtsJson(
      `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
    );

    if (!Array.isArray(body?.jobs)) {
      throw new Error(`Unexpected Greenhouse response for board ${token}`);
    }

    return body.jobs.map(
      (job): IRawAtsJob => ({
        externalId: job.id != null ? String(job.id) : '',
        title: job.title?.trim() ?? '',
        location: job.location?.name ?? '',
        sourceUrl: job.absolute_url ?? '',
        // Greenhouse returns HTML with entities escaped (&lt;p&gt;)
        descriptionHtml: decode(job.content ?? ''),
        publishedAt: job.first_published ? new Date(job.first_published) : undefined,
      }),
    );
  }
}
