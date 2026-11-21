import { ChatContextService } from './chat-context.service';

describe('ChatContextService.buildQueryAwareContext', () => {
  const platform = {
    activeJobCount: 100,
    hiringCompaniesCount: 20,
    topSkills: [],
    topCompanies: [],
    jobsByLevel: [],
  };
  const jobs = [
    { _id: 'j1', name: 'Backend', company: { name: 'VNG' }, salary: 1 },
    { _id: 'j2', name: 'Fullstack', company: { name: 'FPT' }, salary: 2 },
  ];
  const stats = {
    total: 38,
    highestSalary: { id: 'j-top', name: 'Lead', company: 'VNG', salary: 173500000 },
  };
  let jobsService: {
    searchJobs: jest.Mock;
    getJobSearchStats: jest.Mock;
    getHiringCompanyNames: jest.Mock;
  };
  let companiesService: { findByName: jest.Mock };
  let skillsService: { getAliasMap: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: ChatContextService;

  beforeEach(() => {
    jobsService = {
      searchJobs: jest.fn().mockResolvedValue(jobs),
      getJobSearchStats: jest.fn().mockResolvedValue(stats),
      getHiringCompanyNames: jest.fn().mockResolvedValue(['FPT Software', 'VNG', 'AB']),
    };
    companiesService = { findByName: jest.fn().mockResolvedValue([]) };
    skillsService = { getAliasMap: jest.fn().mockResolvedValue({ 'node.js': 'Node.js' }) };
    cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn(),
    };
    service = new ChatContextService(
      cacheManager as any,
      jobsService as any,
      companiesService as any,
      {} as any,
      {} as any,
      skillsService as any,
    );
  });

  it('attaches the real total and highest salary next to the sampled jobs', async () => {
    const result = await service.buildQueryAwareContext(
      'Có bao nhiêu việc làm Node.js đang tuyển?',
      platform,
    );

    expect(result.detectedJobs).toEqual(jobs);
    expect(result.jobStats).toEqual({
      skills: ['Node.js'],
      total: 38,
      shown: 2,
      highestSalary: stats.highestSalary,
    });
    expect(jobsService.searchJobs).toHaveBeenCalledWith(
      ['Node.js'],
      undefined,
      undefined,
      10,
      'newest',
    );
  });

  it('sorts the sample by salary when the question ranks jobs', async () => {
    await service.buildQueryAwareContext('Job Node.js nào có lương cao nhất?', platform);

    expect(jobsService.searchJobs).toHaveBeenCalledWith(
      ['Node.js'],
      undefined,
      undefined,
      10,
      'salary',
    );
  });

  it('still returns the sampled jobs when the stats query fails', async () => {
    jobsService.getJobSearchStats.mockRejectedValue(new Error('db down'));

    const result = await service.buildQueryAwareContext('Việc làm Node.js', platform);

    expect(result.detectedJobs).toEqual(jobs);
    expect(result.jobStats).toBeUndefined();
  });

  it('finds a hiring company that is not in the top 10, ignoring case and accents', async () => {
    companiesService.findByName.mockResolvedValue([
      { _id: 'c1', name: 'FPT Software', address: 'HN', description: 'd', jobCount: 15 },
    ]);

    const result = await service.buildQueryAwareContext(
      'FPT Software hiện có bao nhiêu vị trí đang tuyển trên DevLink?',
      platform,
    );

    expect(companiesService.findByName).toHaveBeenCalledWith('FPT Software', 2);
    expect(result.detectedCompanies).toHaveLength(1);
  });

  it('ignores company names shorter than 3 characters', async () => {
    await service.buildQueryAwareContext('ab có tuyển không?', platform);

    expect(companiesService.findByName).not.toHaveBeenCalled();
  });

  it('reads the hiring company list from cache when present', async () => {
    cacheManager.get.mockResolvedValue(['VNG']);

    await service.buildQueryAwareContext('VNG đang tuyển gì?', platform);

    expect(jobsService.getHiringCompanyNames).not.toHaveBeenCalled();
    expect(companiesService.findByName).toHaveBeenCalledWith('VNG', 2);
  });
});
