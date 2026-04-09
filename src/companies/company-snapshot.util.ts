import mongoose from 'mongoose';

type CompanyIdInput = string | mongoose.Types.ObjectId;
type CompanySnapshotSource = {
  _id: string | mongoose.Types.ObjectId;
  name: string;
  logo?: string | null;
};

export type CompanySnapshotValue = {
  _id: mongoose.Types.ObjectId;
  name: string;
  logo?: string | null;
};

export function buildCanonicalCompanySnapshot(company: CompanySnapshotSource): CompanySnapshotValue {
  return {
    _id: new mongoose.Types.ObjectId(company._id.toString()),
    name: company.name,
    logo: company.logo ?? null,
  };
}

export function buildEmbeddedCompanyIdCandidates(companyId: CompanyIdInput): Array<string | mongoose.Types.ObjectId> {
  const normalizedCompanyId = companyId.toString();

  if (!mongoose.Types.ObjectId.isValid(normalizedCompanyId)) {
    return [normalizedCompanyId];
  }

  return [normalizedCompanyId, new mongoose.Types.ObjectId(normalizedCompanyId)];
}

export function buildEmbeddedCompanyIdFilter(companyId: CompanyIdInput) {
  return {
    'company._id': {
      $in: buildEmbeddedCompanyIdCandidates(companyId),
    },
  };
}

export function buildEmbeddedCompanyIdsInCondition(companyIds: CompanyIdInput[]) {
  const seen = new Set<string>();
  const candidates: Array<string | mongoose.Types.ObjectId> = [];

  for (const companyId of companyIds) {
    for (const candidate of buildEmbeddedCompanyIdCandidates(companyId)) {
      const key =
        typeof candidate === 'string' ? `string:${candidate}` : `objectId:${candidate.toString()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push(candidate);
    }
  }

  return {
    $in: candidates,
  };
}
