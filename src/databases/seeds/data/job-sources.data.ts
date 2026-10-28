import { EJobSourceProvider } from 'src/job-ingestion/enums/job-source-provider.enum';

type JobSourceSeed = {
  key: string;
  provider: EJobSourceProvider;
  boardToken: string;
  companyName: string;
  enabled: boolean;
};

// Boards checked on 2026-10-27 to list Vietnam-based engineering roles.
export const JOB_SOURCES_SEED_DATA: JobSourceSeed[] = [
  {
    key: 'greenhouse-axon',
    provider: EJobSourceProvider.GREENHOUSE,
    boardToken: 'axon',
    companyName: 'Axon',
    enabled: true,
  },
  {
    key: 'greenhouse-thoughtworks',
    provider: EJobSourceProvider.GREENHOUSE,
    boardToken: 'thoughtworks',
    companyName: 'Thoughtworks',
    enabled: true,
  },
  {
    key: 'greenhouse-agoda',
    provider: EJobSourceProvider.GREENHOUSE,
    boardToken: 'agoda',
    companyName: 'Agoda',
    enabled: true,
  },
  {
    key: 'lever-ninjavan',
    provider: EJobSourceProvider.LEVER,
    boardToken: 'ninjavan',
    companyName: 'Ninja Van',
    enabled: true,
  },
  // Aggregator: company comes from each posting; boardToken is unused by the adapter.
  {
    key: 'topdev',
    provider: EJobSourceProvider.TOPDEV,
    boardToken: 'topdev',
    companyName: 'TopDev',
    enabled: true,
  },
];
