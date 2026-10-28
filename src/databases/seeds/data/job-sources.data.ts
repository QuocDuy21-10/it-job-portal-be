import { EJobSourceDisplayPolicy } from 'src/job-ingestion/enums/job-source-display-policy.enum';
import { EJobSourceProvider } from 'src/job-ingestion/enums/job-source-provider.enum';

type JobSourceSeed = {
  key: string;
  provider: EJobSourceProvider;
  boardToken: string;
  companyName: string;
  enabled: boolean;
  displayPolicy: EJobSourceDisplayPolicy;
};

// Boards checked on 2026-10-27 to list Vietnam-based engineering roles.
export const JOB_SOURCES_SEED_DATA: JobSourceSeed[] = [
  {
    key: 'greenhouse-axon',
    provider: EJobSourceProvider.GREENHOUSE,
    boardToken: 'axon',
    companyName: 'Axon',
    enabled: true,
    displayPolicy: EJobSourceDisplayPolicy.FULL,
  },
  {
    key: 'greenhouse-thoughtworks',
    provider: EJobSourceProvider.GREENHOUSE,
    boardToken: 'thoughtworks',
    companyName: 'Thoughtworks',
    enabled: true,
    displayPolicy: EJobSourceDisplayPolicy.FULL,
  },
  {
    key: 'greenhouse-agoda',
    provider: EJobSourceProvider.GREENHOUSE,
    boardToken: 'agoda',
    companyName: 'Agoda',
    enabled: true,
    displayPolicy: EJobSourceDisplayPolicy.FULL,
  },
  {
    key: 'lever-ninjavan',
    provider: EJobSourceProvider.LEVER,
    boardToken: 'ninjavan',
    companyName: 'Ninja Van',
    enabled: true,
    displayPolicy: EJobSourceDisplayPolicy.FULL,
  },
  // Aggregator: company comes from each posting; boardToken is unused by the adapter.
  // LINK_ONLY until a content licence with the aggregator is signed.
  {
    key: 'topdev',
    provider: EJobSourceProvider.TOPDEV,
    boardToken: 'topdev',
    companyName: 'TopDev',
    enabled: true,
    displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY,
  },
  {
    key: 'itviec',
    provider: EJobSourceProvider.ITVIEC,
    boardToken: 'itviec',
    companyName: 'ITviec',
    enabled: true,
    displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY,
  },
];
