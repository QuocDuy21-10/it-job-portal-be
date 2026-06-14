import { Types } from 'mongoose';

import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { resolveLocationPayload } from 'src/utils/location-catalog';

type CompanyRef = {
  _id: Types.ObjectId;
  name: string;
  logo?: string | null;
};

export type JobSeed = {
  name: string;
  skills: string[];
  company: {
    _id: Types.ObjectId;
    name: string;
    logo?: string | null;
  };
  location: string;
  locationCode: string;
  salary: number;
  quantity: number;
  level: EJobLevel;
  formOfWork: EJobFormOfWork;
  description: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  approvalStatus: EJobApprovalStatus;
  approvalNote?: string;
  createdAt: Date;
  updatedAt: Date;
};

const jobProfiles = [
  {
    title: 'Backend Engineer (Node.js/NestJS)',
    skills: ['Node.js', 'NestJS', 'TypeScript', 'MongoDB', 'Redis'],
    level: EJobLevel.SENIOR,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 3300,
    description:
      'Design scalable APIs, improve service reliability, and own backend features for high-traffic product teams.',
  },
  {
    title: 'Frontend Engineer (React/Next.js)',
    skills: ['React', 'Next.js', 'TypeScript', 'Redux', 'Tailwind CSS'],
    level: EJobLevel.MID_LEVEL,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 2600,
    description:
      'Build polished user interfaces, reusable components, and frontend workflows for customer-facing products.',
  },
  {
    title: 'Full Stack Developer (Java/Spring Boot)',
    skills: ['Java', 'Spring Boot', 'React', 'PostgreSQL', 'Docker'],
    level: EJobLevel.MID_LEVEL,
    formOfWork: EJobFormOfWork.HYBRID,
    baseSalary: 2800,
    description:
      'Work across frontend and backend services to deliver enterprise product features from database to UI.',
  },
  {
    title: 'Mobile Developer (React Native)',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'REST API'],
    level: EJobLevel.MID_LEVEL,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 2400,
    description:
      'Develop cross-platform mobile features with a focus on performance, release quality, and user experience.',
  },
  {
    title: 'DevOps Engineer (AWS/Kubernetes)',
    skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
    level: EJobLevel.SENIOR,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 3600,
    description:
      'Operate cloud infrastructure, automate deployments, and improve observability for production systems.',
  },
  {
    title: 'Data Engineer (Spark/Kafka)',
    skills: ['Python', 'Apache Spark', 'Kafka', 'SQL', 'Airflow', 'AWS S3'],
    level: EJobLevel.MID_LEVEL,
    formOfWork: EJobFormOfWork.HYBRID,
    baseSalary: 3100,
    description:
      'Build data pipelines that support analytics, product reporting, and machine learning use cases.',
  },
  {
    title: 'Machine Learning Engineer',
    skills: ['Python', 'PyTorch', 'TensorFlow', 'MLflow', 'Docker', 'FastAPI'],
    level: EJobLevel.SENIOR,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 4200,
    description:
      'Train, evaluate, and deploy machine learning models for recommendation, risk, and automation products.',
  },
  {
    title: 'QA Automation Engineer',
    skills: ['Cypress', 'Playwright', 'Jest', 'Selenium', 'CI/CD', 'Python'],
    level: EJobLevel.MID_LEVEL,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 1900,
    description:
      'Create automated test coverage for critical flows and improve release confidence across product squads.',
  },
  {
    title: 'Security Engineer (Application Security)',
    skills: ['OWASP', 'Penetration Testing', 'Python', 'Burp Suite', 'AWS', 'Docker'],
    level: EJobLevel.SENIOR,
    formOfWork: EJobFormOfWork.HYBRID,
    baseSalary: 3500,
    description:
      'Run application security reviews, threat modeling, and security automation for engineering teams.',
  },
  {
    title: 'Engineering Manager',
    skills: ['Team Leadership', 'Agile', 'System Design', 'Node.js', 'OKRs', 'Mentoring'],
    level: EJobLevel.MANAGER,
    formOfWork: EJobFormOfWork.FULL_TIME,
    baseSalary: 5200,
    description:
      'Lead a cross-functional engineering team, coach engineers, and partner with product on delivery planning.',
  },
];

const locations = ['Ha Noi', 'Ho Chi Minh City', 'Da Nang', 'Can Tho', 'Hai Phong', 'Remote'];

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

const getCreatedAt = (now: Date, index: number): Date => {
  if (index % 25 === 0) {
    return addHours(now, -(index % 18));
  }

  return addDays(now, -(index % 90));
};

const resolveLocationFields = (value: string) => {
  const resolvedLocation = resolveLocationPayload({ location: value });

  if (!resolvedLocation) {
    throw new Error(`Unsupported seed location: ${value}`);
  }

  return {
    location: resolvedLocation.location,
    locationCode: resolvedLocation.locationCode,
  };
};

const resolveJobState = (
  now: Date,
  createdAt: Date,
  index: number,
): Pick<JobSeed, 'approvalStatus' | 'approvalNote' | 'endDate' | 'isActive'> => {
  const bucket = index % 20;

  if (bucket <= 11) {
    return {
      approvalStatus: EJobApprovalStatus.APPROVED,
      endDate: addDays(now, 30 + (index % 120)),
      isActive: true,
    };
  }

  if (bucket <= 14) {
    return {
      approvalStatus: EJobApprovalStatus.APPROVED,
      endDate: addDays(now, -1 - (index % 45)),
      isActive: true,
    };
  }

  if (bucket <= 16) {
    return {
      approvalStatus: EJobApprovalStatus.PENDING,
      endDate: addDays(now, 45 + (index % 90)),
      isActive: true,
    };
  }

  if (bucket <= 18) {
    return {
      approvalStatus: EJobApprovalStatus.APPROVED,
      endDate: addDays(now, 60 + (index % 90)),
      isActive: false,
    };
  }

  return {
    approvalStatus: EJobApprovalStatus.REJECTED,
    approvalNote: 'Seeded moderation sample: job description requires revision.',
    endDate: addDays(createdAt, 60),
    isActive: false,
  };
};

export function createJobsSeedData(companies: CompanyRef[]): JobSeed[] {
  const now = new Date();

  return companies.flatMap((company, companyIndex) =>
    jobProfiles.map((profile, profileIndex) => {
      const index = companyIndex * jobProfiles.length + profileIndex;
      const createdAt = getCreatedAt(now, index);
      const state = resolveJobState(now, createdAt, index);
      const location = locations[(companyIndex + profileIndex) % locations.length];

      return {
        name: `${profile.title} - ${company.name}`,
        skills: profile.skills,
        company: {
          _id: company._id,
          name: company.name,
          logo: company.logo ?? null,
        },
        ...resolveLocationFields(location),
        salary: profile.baseSalary + (companyIndex % 5) * 150 + profileIndex * 50,
        quantity: 1 + ((companyIndex + profileIndex) % 6),
        level: profile.level,
        formOfWork: profile.formOfWork,
        description: `${profile.description} This role is part of ${company.name}'s technology organization in Vietnam.`,
        startDate: createdAt,
        createdAt,
        updatedAt: createdAt,
        ...state,
      };
    }),
  );
}
