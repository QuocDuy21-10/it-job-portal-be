import { Types } from 'mongoose';

import { EResumePriority } from 'src/resumes/enums/resume-priority.enum';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';

import { CandidateUserRef, CvProfileSeed, getCandidateSkillTrack } from './cv-profiles.data';

type JobRef = {
  _id: Types.ObjectId;
  name: string;
  skills: string[];
  company: {
    _id: Types.ObjectId;
    name: string;
    logo?: string | null;
  };
};

export type ResumeSeed = {
  email: string;
  userId: Types.ObjectId;
  url: string;
  status: EResumeStatus;
  companyId: Types.ObjectId;
  jobId: Types.ObjectId;
  parsedData?: {
    fullName?: string;
    email?: string;
    phone?: string;
    skills?: string[];
    normalizedSkills?: string[];
    unmappedSkills?: string[];
    experience?: Array<{
      company: string;
      position: string;
      duration: string;
      description: string;
    }>;
    education?: Array<{
      school: string;
      degree: string;
      major: string;
      duration: string;
      gpa?: string;
    }>;
    summary?: string;
    yearsOfExperience?: number;
  };
  aiAnalysis?: {
    matchingScore?: number;
    skillsMatch?: Array<{
      skill: string;
      matched: boolean;
      proficiencyLevel?: string;
    }>;
    strengths?: string[];
    weaknesses?: string[];
    summary?: string;
    recommendation?: string;
    analyzedAt?: Date;
  };
  priority: EResumePriority;
  isParsed: boolean;
  isAnalyzed: boolean;
  parseError?: string;
  analysisError?: string;
  cvStructuredData?: CvProfileSeed;
  histories: Array<{
    status: EResumeStatus;
    updatedAt: Date;
    updatedBy: {
      _id: Types.ObjectId;
      email: string;
    };
  }>;
  createdBy: {
    _id: Types.ObjectId;
    email: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addHours = (date: Date, hours: number): Date => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

const normalizeSkill = (skill: string): string =>
  skill.toLowerCase().replace(/[^a-z0-9+#.]+/g, '-');

const getCreatedAt = (now: Date, index: number): Date => {
  if (index % 25 === 0) {
    return addHours(now, -(index % 18));
  }

  if (index % 10 < 3) {
    return addDays(now, -(index % 7));
  }

  return addDays(now, -(index % 60));
};

const getResumeStatus = (index: number): EResumeStatus => {
  const statuses = [
    EResumeStatus.PENDING,
    EResumeStatus.REVIEWING,
    EResumeStatus.INTERVIEWING,
    EResumeStatus.APPROVED,
    EResumeStatus.REJECTED,
    EResumeStatus.REVIEWING,
    EResumeStatus.APPROVED,
    EResumeStatus.REJECTED,
    EResumeStatus.PENDING,
    EResumeStatus.REJECTED,
  ];

  return statuses[index % statuses.length];
};

const getPriority = (score: number): EResumePriority => {
  if (score >= 80) return EResumePriority.EXCELLENT;
  if (score >= 60) return EResumePriority.HIGH;
  if (score >= 40) return EResumePriority.MEDIUM;
  return EResumePriority.LOW;
};

const buildHistories = (candidate: CandidateUserRef, status: EResumeStatus, createdAt: Date) => {
  const histories = [
    {
      status: EResumeStatus.PENDING,
      updatedAt: createdAt,
      updatedBy: {
        _id: candidate._id,
        email: candidate.email,
      },
    },
  ];

  if (status !== EResumeStatus.PENDING) {
    histories.push({
      status,
      updatedAt: addHours(createdAt, 6 + (createdAt.getDate() % 36)),
      updatedBy: {
        _id: candidate._id,
        email: candidate.email,
      },
    });
  }

  return histories;
};

export function createResumesSeedData(
  candidates: CandidateUserRef[],
  jobs: JobRef[],
  cvProfiles: CvProfileSeed[],
): ResumeSeed[] {
  const now = new Date();
  const resumes: ResumeSeed[] = [];
  const cvProfileByUserId = new Map(
    cvProfiles.map(profile => [profile.userId.toString(), profile]),
  );

  candidates.forEach((candidate, candidateIndex) => {
    const track = getCandidateSkillTrack(candidateIndex);

    Array.from({ length: 4 }).forEach((_, applicationIndex) => {
      const index = candidateIndex * 4 + applicationIndex;
      const job = jobs[(candidateIndex * 7 + applicationIndex * 13) % jobs.length];
      const cvProfile = cvProfileByUserId.get(candidate._id.toString());
      const createdAt = getCreatedAt(now, index);
      const status = getResumeStatus(index);
      const parseFailed = index % 37 === 0;
      const analysisFailed = !parseFailed && index % 41 === 0;
      const matchingScore = 35 + ((index * 17) % 61);
      const isParsed = !parseFailed;
      const isAnalyzed = isParsed && !analysisFailed;
      const updatedAt =
        status === EResumeStatus.PENDING ? createdAt : addHours(createdAt, 18 + (index % 72));

      resumes.push({
        email: candidate.email,
        userId: candidate._id,
        url: `/images/resumes/seed-candidate-${String(candidateIndex + 1).padStart(3, '0')}.pdf`,
        status,
        companyId: job.company._id,
        jobId: job._id,
        parsedData: isParsed
          ? {
              fullName: candidate.name,
              email: candidate.email,
              phone: cvProfile?.personalInfo.phone,
              skills: track.skills,
              normalizedSkills: track.skills.map(normalizeSkill),
              unmappedSkills: [],
              experience: [
                {
                  company: cvProfile?.experience[0]?.company ?? 'Seed Software Studio',
                  position: track.title,
                  duration: '2021 - Present',
                  description: `Built production features using ${track.skills.slice(0, 4).join(', ')}.`,
                },
              ],
              education: [
                {
                  school: cvProfile?.education[0]?.school ?? 'University of Information Technology',
                  degree: 'Bachelor',
                  major: 'Computer Science',
                  duration: '2014 - 2018',
                  gpa: index % 5 === 0 ? '3.6/4.0' : undefined,
                },
              ],
              summary: `${track.title} applying for ${job.name}.`,
              yearsOfExperience: (candidateIndex % 6) + 1,
            }
          : undefined,
        aiAnalysis: isAnalyzed
          ? {
              matchingScore,
              skillsMatch: job.skills.map(skill => ({
                skill,
                matched: track.skills.includes(skill),
                proficiencyLevel: track.skills.includes(skill) ? 'Intermediate' : undefined,
              })),
              strengths: track.skills.slice(0, 3),
              weaknesses: job.skills.filter(skill => !track.skills.includes(skill)).slice(0, 2),
              summary: `Seed analysis score ${matchingScore} for ${job.name}.`,
              recommendation:
                matchingScore >= 70
                  ? 'Strong candidate for recruiter review.'
                  : 'Candidate has partial skill overlap and may need screening.',
              analyzedAt: addHours(createdAt, 2),
            }
          : undefined,
        priority: isAnalyzed ? getPriority(matchingScore) : EResumePriority.LOW,
        isParsed,
        isAnalyzed,
        parseError: parseFailed ? 'Seed sample parse failure for dashboard health.' : undefined,
        analysisError: analysisFailed
          ? 'Seed sample analysis failure for dashboard health.'
          : undefined,
        cvStructuredData: cvProfile,
        histories: buildHistories(candidate, status, createdAt),
        createdBy: {
          _id: candidate._id,
          email: candidate.email,
        },
        createdAt,
        updatedAt,
      });
    });
  });

  return resumes;
}
