import { runJobFollowersNotifiedMigration } from './job-followers-notified';

describe('runJobFollowersNotifiedMigration', () => {
  it('marks only approved jobs without a mark, using approvedAt when present', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });

    await expect(runJobFollowersNotifiedMigration({ updateMany })).resolves.toEqual({
      jobsMarked: 3,
    });
    expect(updateMany).toHaveBeenCalledWith(
      { approvalStatus: 'APPROVED', followersNotifiedAt: null },
      [{ $set: { followersNotifiedAt: { $ifNull: ['$approvedAt', '$updatedAt', '$$NOW'] } } }],
    );
  });
});
