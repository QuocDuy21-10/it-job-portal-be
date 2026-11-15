import { Types } from 'mongoose';

import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { resolveLocationPayload } from 'src/utils/location-catalog';

import { ProductionCompany } from './companies.production';

type RoleKey =
  | 'backend-node'
  | 'backend-java'
  | 'backend-go'
  | 'frontend'
  | 'fullstack'
  | 'react-native'
  | 'ios'
  | 'android'
  | 'devops'
  | 'data'
  | 'ml'
  | 'qa'
  | 'security'
  | 'blockchain'
  | 'manager';

type Role = {
  title: string;
  skills: string[];
  salary: [number, number]; // monthly VND for a Mid-level hire
  summary: string;
  responsibilities: string[];
  requirements: string[];
};

const ROLES: Record<RoleKey, Role> = {
  'backend-node': {
    title: 'Backend Engineer (Node.js/NestJS)',
    skills: ['Node.js', 'NestJS', 'TypeScript', 'MongoDB', 'Redis', 'Docker'],
    salary: [28_000_000, 45_000_000],
    summary: 'design and ship the APIs and services behind our customer-facing products',
    responsibilities: [
      'Design, build and maintain RESTful APIs and background workers with NestJS and TypeScript.',
      'Model data in MongoDB and tune queries, indexes and caching with Redis for high-traffic endpoints.',
      'Write unit and integration tests, and take part in code reviews and release planning.',
      'Monitor services in production, investigate incidents and improve reliability.',
    ],
    requirements: [
      'Solid experience with Node.js, TypeScript and a framework such as NestJS or Express.',
      'Good understanding of REST API design, authentication, and database indexing.',
      'Familiar with Docker and Git-based CI/CD workflows.',
      'Able to read English technical documentation.',
    ],
  },
  'backend-java': {
    title: 'Java Backend Engineer (Spring Boot)',
    skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Microservices', 'Kafka', 'Docker'],
    salary: [30_000_000, 50_000_000],
    summary: 'build scalable, secure microservices for business-critical systems',
    responsibilities: [
      'Develop and maintain microservices with Java and Spring Boot.',
      'Integrate services through REST APIs and Kafka event streams.',
      'Optimize PostgreSQL schemas and queries for transactional workloads.',
      'Contribute to technical design documents and mentor teammates in code review.',
    ],
    requirements: [
      'Strong Java skills and hands-on experience with Spring Boot.',
      'Experience with relational databases (PostgreSQL) and message brokers such as Kafka.',
      'Understanding of microservice patterns, transactions and API security.',
      'Knowledge of Docker and CI/CD is a plus.',
    ],
  },
  'backend-go': {
    title: 'Backend Engineer (Go)',
    skills: ['Go', 'Microservices', 'PostgreSQL', 'Redis', 'Kafka', 'Kubernetes'],
    salary: [35_000_000, 58_000_000],
    summary: 'build high-throughput services that serve millions of requests every day',
    responsibilities: [
      'Build low-latency services in Go and expose them through REST and gRPC APIs.',
      'Design data flows with PostgreSQL, Redis and Kafka under heavy load.',
      'Profile and optimize performance-critical paths and own service SLOs.',
      'Collaborate with DevOps to deploy and scale services on Kubernetes.',
    ],
    requirements: [
      'Practical experience writing production services in Go.',
      'Good knowledge of concurrency, networking and distributed systems basics.',
      'Experience with PostgreSQL, Redis or comparable data stores.',
      'Comfortable with Docker and Kubernetes in a team setting.',
    ],
  },
  frontend: {
    title: 'Frontend Engineer (React/Next.js)',
    skills: ['React', 'Next.js', 'TypeScript', 'Redux', 'Tailwind CSS', 'Jest'],
    salary: [25_000_000, 42_000_000],
    summary: 'craft fast, accessible interfaces used by customers every day',
    responsibilities: [
      'Build reusable components and pages with React, Next.js and TypeScript.',
      'Work with designers and backend engineers to deliver polished user flows.',
      'Improve web performance, accessibility and SEO across the product.',
      'Write component and end-to-end tests to keep releases stable.',
    ],
    requirements: [
      'Hands-on experience with React and TypeScript; Next.js is a plus.',
      'Good grasp of HTML, CSS, state management and browser performance.',
      'Experience consuming REST APIs and handling error and loading states.',
      'An eye for detail and care for UX.',
    ],
  },
  fullstack: {
    title: 'Full Stack Developer (React/Node.js)',
    skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'REST API'],
    salary: [27_000_000, 45_000_000],
    summary: 'own features end to end, from database to user interface',
    responsibilities: [
      'Deliver features across the stack with React on the frontend and Node.js on the backend.',
      'Design database schemas and REST APIs together with the product team.',
      'Review pull requests, write tests and keep technical documentation up to date.',
      'Support production releases and troubleshoot issues.',
    ],
    requirements: [
      'Experience with React and a backend runtime such as Node.js or Java.',
      'Knowledge of SQL databases and API design.',
      'Familiar with Git, Docker and automated testing.',
      'Good communication skills and willingness to learn.',
    ],
  },
  'react-native': {
    title: 'Mobile Developer (React Native)',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'REST API', 'Redux'],
    salary: [26_000_000, 42_000_000],
    summary: 'ship a smooth cross-platform mobile app to a large user base',
    responsibilities: [
      'Develop and maintain features for iOS and Android with React Native.',
      'Integrate REST APIs, push notifications and analytics.',
      'Optimize app startup time, memory use and rendering performance.',
      'Publish releases to the App Store and Google Play with the QA team.',
    ],
    requirements: [
      'Experience building and releasing React Native apps.',
      'Good knowledge of TypeScript and mobile app architecture.',
      'Familiar with native modules or willing to learn Swift/Kotlin basics.',
      'Experience with app store release processes is a plus.',
    ],
  },
  ios: {
    title: 'iOS Developer (Swift)',
    skills: ['Swift', 'SwiftUI', 'Combine', 'CoreData', 'Xcode', 'REST API'],
    salary: [30_000_000, 50_000_000],
    summary: 'build and polish a high-quality native iOS experience',
    responsibilities: [
      'Develop native iOS features using Swift and SwiftUI.',
      'Apply clean architecture and write unit tests for business logic.',
      'Integrate backend APIs, local storage with CoreData and analytics.',
      'Work closely with designers to deliver pixel-accurate interfaces.',
    ],
    requirements: [
      'Solid experience with Swift and iOS SDK.',
      'Knowledge of SwiftUI, Combine and common architectures such as MVVM.',
      'Experience publishing apps to the App Store.',
      'Understanding of performance profiling with Xcode Instruments.',
    ],
  },
  android: {
    title: 'Android Developer (Kotlin)',
    skills: ['Kotlin', 'Jetpack Compose', 'Coroutines', 'MVVM', 'Android SDK', 'REST API'],
    salary: [28_000_000, 48_000_000],
    summary: 'build a fast and reliable native Android app',
    responsibilities: [
      'Develop native Android features using Kotlin and Jetpack Compose.',
      'Follow MVVM and clean architecture, with unit and UI tests.',
      'Integrate backend APIs and handle offline and error scenarios.',
      'Monitor crashes and performance and fix issues quickly.',
    ],
    requirements: [
      'Strong Kotlin skills and Android SDK experience.',
      'Familiar with Jetpack libraries, Coroutines and dependency injection.',
      'Experience releasing apps to Google Play.',
      'Attention to app performance on mid-range devices.',
    ],
  },
  devops: {
    title: 'DevOps Engineer (AWS/Kubernetes)',
    skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Prometheus'],
    salary: [35_000_000, 60_000_000],
    summary: 'run reliable cloud infrastructure and speed up delivery for product teams',
    responsibilities: [
      'Provision and manage cloud infrastructure with Terraform on AWS.',
      'Operate Kubernetes clusters and build CI/CD pipelines for multiple teams.',
      'Set up monitoring and alerting with Prometheus and Grafana.',
      'Improve security, cost efficiency and disaster recovery practices.',
    ],
    requirements: [
      'Experience with AWS, Docker and Kubernetes in production.',
      'Infrastructure-as-code experience, preferably Terraform.',
      'Good Linux, networking and scripting skills.',
      'Experience with monitoring, logging and incident response.',
    ],
  },
  data: {
    title: 'Data Engineer (Spark/Kafka)',
    skills: ['Python', 'Apache Spark', 'Kafka', 'SQL', 'Airflow', 'AWS S3'],
    salary: [32_000_000, 55_000_000],
    summary: 'build the data pipelines that power analytics, reporting and machine learning',
    responsibilities: [
      'Design and operate batch and streaming pipelines with Spark, Kafka and Airflow.',
      'Model data warehouse tables and keep data quality checks in place.',
      'Partner with analysts and data scientists to deliver reliable datasets.',
      'Optimize pipeline cost and performance on cloud storage.',
    ],
    requirements: [
      'Strong SQL and Python skills.',
      'Experience with Spark, Airflow or similar data tooling.',
      'Understanding of data modeling and ETL/ELT design.',
      'Knowledge of cloud storage such as AWS S3 is a plus.',
    ],
  },
  ml: {
    title: 'Machine Learning Engineer',
    skills: ['Python', 'PyTorch', 'TensorFlow', 'MLflow', 'FastAPI', 'Docker'],
    salary: [38_000_000, 65_000_000],
    summary: 'turn models into production features such as recommendation, search and risk scoring',
    responsibilities: [
      'Train, evaluate and iterate on machine learning models for production use cases.',
      'Build model serving APIs with FastAPI and manage experiments with MLflow.',
      'Work with data engineers to build features and monitor model quality.',
      'Run A/B tests and report the business impact of models.',
    ],
    requirements: [
      'Solid foundation in machine learning and Python.',
      'Experience with PyTorch or TensorFlow.',
      'Experience deploying models behind APIs in production.',
      'Good communication with product and engineering teams.',
    ],
  },
  qa: {
    title: 'QA Automation Engineer',
    skills: ['Cypress', 'Playwright', 'Selenium', 'Jest', 'CI/CD', 'Python'],
    salary: [20_000_000, 35_000_000],
    summary: 'raise release confidence with reliable automated testing',
    responsibilities: [
      'Design and maintain automated UI and API test suites.',
      'Integrate tests into CI/CD pipelines and report on quality metrics.',
      'Work with developers to define test strategy for new features.',
      'Investigate flaky tests and reproduce bugs reported from production.',
    ],
    requirements: [
      'Experience with Cypress, Playwright or Selenium.',
      'Knowledge of API testing and a scripting language such as Python or TypeScript.',
      'Good understanding of the software testing life cycle.',
      'Careful, analytical mindset.',
    ],
  },
  security: {
    title: 'Application Security Engineer',
    skills: ['OWASP', 'Penetration Testing', 'Burp Suite', 'SAST/DAST', 'Python', 'AWS'],
    salary: [38_000_000, 65_000_000],
    summary: 'find and fix vulnerabilities before attackers do',
    responsibilities: [
      'Perform security reviews, threat modeling and penetration tests on web and mobile applications.',
      'Automate SAST and DAST scanning in the CI/CD pipeline.',
      'Guide engineering teams on fixing findings and secure coding practices.',
      'Contribute to incident response and security awareness programs.',
    ],
    requirements: [
      'Experience in application security or penetration testing.',
      'Good knowledge of the OWASP Top 10 and tools such as Burp Suite.',
      'Scripting skills in Python or similar.',
      'Security certifications such as OSCP are a plus.',
    ],
  },
  blockchain: {
    title: 'Blockchain Engineer (Solidity)',
    skills: ['Solidity', 'Hardhat', 'Ethers.js', 'Web3', 'TypeScript', 'Node.js'],
    salary: [45_000_000, 80_000_000],
    summary: 'write and secure smart contracts that handle real on-chain value',
    responsibilities: [
      'Design, implement and test smart contracts in Solidity with Hardhat.',
      'Build backend services and tooling with TypeScript, Node.js and Ethers.js.',
      'Collaborate with security auditors and fix findings.',
      'Monitor on-chain activity and support production deployments.',
    ],
    requirements: [
      'Solid experience with Solidity and the EVM.',
      'Good understanding of smart contract security patterns.',
      'Experience with Ethers.js or Web3 libraries.',
      'Contributions to open-source or audited contracts are a plus.',
    ],
  },
  manager: {
    title: 'Engineering Manager',
    skills: ['Team Leadership', 'Agile', 'System Design', 'Node.js', 'OKRs'],
    salary: [60_000_000, 100_000_000],
    summary: 'lead a cross-functional engineering team and deliver on product goals',
    responsibilities: [
      'Lead, coach and grow a team of engineers.',
      'Plan delivery with product managers and keep the team aligned on OKRs.',
      'Own technical quality, architecture decisions and incident follow-ups.',
      'Hire and onboard new team members.',
    ],
    requirements: [
      'Experience leading engineering teams of 5 or more people.',
      'Strong system design and delivery management skills.',
      'Experience hiring and giving constructive feedback.',
      'Clear communication in Vietnamese and English.',
    ],
  },
};

const SECTOR_ROLES: Record<ProductionCompany['sector'], RoleKey[]> = {
  outsourcing: [
    'backend-java',
    'backend-node',
    'frontend',
    'fullstack',
    'react-native',
    'qa',
    'devops',
    'android',
    'ios',
    'data',
  ],
  ecommerce: [
    'backend-go',
    'backend-node',
    'frontend',
    'data',
    'ml',
    'devops',
    'react-native',
    'qa',
    'android',
  ],
  fintech: [
    'backend-java',
    'backend-go',
    'security',
    'devops',
    'data',
    'ios',
    'android',
    'frontend',
    'qa',
  ],
  product: [
    'backend-node',
    'backend-go',
    'frontend',
    'react-native',
    'ml',
    'devops',
    'data',
    'manager',
    'fullstack',
  ],
  enterprise: [
    'backend-java',
    'fullstack',
    'devops',
    'data',
    'qa',
    'security',
    'android',
    'ml',
    'frontend',
  ],
};

const SECTOR_CONTEXT: Record<ProductionCompany['sector'], string> = {
  outsourcing:
    'You will work on projects for international clients across banking, retail and healthcare.',
  ecommerce: 'You will work on a marketplace used by millions of shoppers and sellers.',
  fintech: 'You will work on payment and financial products where reliability and security matter.',
  product: 'You will join a product team that releases improvements to real users every week.',
  enterprise: 'You will work on large-scale systems that support a diversified business group.',
};

const BENEFITS = [
  'Competitive salary, 13th-month salary and performance bonus.',
  'Full social, health and accident insurance, plus annual health check-up.',
  'Hybrid working arrangements and flexible hours.',
  'Learning budget for courses, certifications and conferences.',
  'Team building, company trips and friendly, collaborative culture.',
];

const LEVELS: Array<{ level: EJobLevel; prefix: string; factor: number; years: string }> = [
  { level: EJobLevel.JUNIOR, prefix: 'Junior', factor: 0.6, years: '1+ year' },
  { level: EJobLevel.MID_LEVEL, prefix: '', factor: 1, years: '2+ years' },
  { level: EJobLevel.SENIOR, prefix: 'Senior', factor: 1.5, years: '4+ years' },
  { level: EJobLevel.LEAD, prefix: 'Lead', factor: 1.9, years: '6+ years' },
];

const JOBS_PER_COMPANY = 6;
// Large employers hire more, so the "Top Companies Hiring Now" ranking is not a flat tie.
const TOTAL_JOBS: Record<string, number> = {
  'fpt-software': 16,
  momo: 14,
  'vng-corporation': 14,
  'shopee-vietnam': 13,
  techcombank: 12,
  'tiki-corporation': 12,
  'grab-vietnam': 11,
  vnpay: 10,
  vinfast: 10,
  'lazada-vietnam': 9,
  'tma-solutions': 9,
  'nash-tech': 8,
  rikkeisoft: 8,
};
const ROUND_TO_VND = 500_000;

export type JobCompanyRef = {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  logo: string;
  tier: number;
  city: ProductionCompany['city'];
  sector: ProductionCompany['sector'];
};

export type JobActorRef = { _id: Types.ObjectId; email: string };

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const list = (items: string[]): string =>
  `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;

const resolveLocation = (value: string) => {
  const resolved = resolveLocationPayload({ location: value });

  if (!resolved) {
    throw new Error(`Unsupported seed location: ${value}`);
  }

  return { location: resolved.location, locationCode: resolved.locationCode };
};

export function createProductionJobs(
  companies: JobCompanyRef[],
  hrByCompany: Map<string, JobActorRef>,
  admin: JobActorRef,
  now = new Date(),
) {
  return companies.flatMap((company, companyIndex) => {
    const hr = hrByCompany.get(company.slug);
    const roleKeys: RoleKey[] =
      company.slug === 'sky-mavis'
        ? ['blockchain', 'backend-node', 'frontend', 'devops', 'security', 'manager']
        : Array.from(
            { length: TOTAL_JOBS[company.slug] ?? JOBS_PER_COMPANY },
            (_, i) =>
              SECTOR_ROLES[company.sector][
                (companyIndex + i) % SECTOR_ROLES[company.sector].length
              ],
          );

    const usedNames = new Set<string>();

    return roleKeys.flatMap((roleKey, i) => {
      const role = ROLES[roleKey];
      const index = companyIndex * JOBS_PER_COMPANY + i;
      // Junior / Mid / Senior rotate; managers are always Lead. A repeated role takes the next free level.
      const titleOf = (l: (typeof LEVELS)[number]) =>
        `${l.prefix ? `${l.prefix} ` : ''}${role.title}`;
      const lvl = (
        roleKey === 'manager' ? [LEVELS[3]] : [0, 1, 2].map(k => LEVELS[(index + i + k) % 3])
      ).find(l => !usedNames.has(titleOf(l)));

      if (!lvl) {
        return [];
      }
      const [min, max] = role.salary;
      const base = min + ((max - min) * ((index * 7) % 10)) / 10;
      const salary = Math.round((base * lvl.factor * company.tier) / ROUND_TO_VND) * ROUND_TO_VND;
      const createdAt = addDays(now, -((index * 3) % 40));
      const pending = i < JOBS_PER_COMPANY && index % 17 === 0;
      const title = titleOf(lvl).trim();
      usedNames.add(titleOf(lvl));
      const place = company.sector === 'outsourcing' && index % 4 === 0 ? 'Da Nang' : company.city;

      return [
        {
          name: title,
          skills: role.skills,
          company: { _id: company._id, name: company.name, logo: company.logo },
          ...resolveLocation(place),
          salary,
          quantity: 1 + (index % 4),
          level: lvl.level,
          formOfWork: index % 3 === 0 ? EJobFormOfWork.HYBRID : EJobFormOfWork.FULL_TIME,
          description:
            `<h3>About the role</h3><p>${company.name} is hiring a ${title} to ${role.summary}. ` +
            `${SECTOR_CONTEXT[company.sector]}</p>` +
            `<h3>Responsibilities</h3>${list(role.responsibilities)}` +
            `<h3>Requirements</h3>${list([`${lvl.years} of relevant experience.`, ...role.requirements])}` +
            `<h3>Benefits</h3>${list(BENEFITS)}`,
          startDate: createdAt,
          endDate: addDays(now, 20 + ((index * 5) % 50)),
          isActive: true,
          approvalStatus: pending ? EJobApprovalStatus.PENDING : EJobApprovalStatus.APPROVED,
          ...(pending ? {} : { approvedBy: admin, approvedAt: createdAt }),
          ...(hr ? { createdBy: hr } : {}),
          createdAt,
          updatedAt: createdAt,
        },
      ];
    });
  });
}
