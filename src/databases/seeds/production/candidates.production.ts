import { Types } from 'mongoose';

import { CvProfileSeed } from '../data/cv-profiles.data';

export type ProductionCandidate = { name: string; email: string };

// Fictional people; example.com addresses cannot receive mail.
const NAMES = [
  'Nguyễn Hoàng Long',
  'Trần Thị Thu Hà',
  'Lê Minh Đức',
  'Phạm Ngọc Anh',
  'Hoàng Văn Nam',
  'Vũ Thị Hương',
  'Đặng Quốc Bảo',
  'Bùi Thanh Tùng',
  'Đỗ Khánh Linh',
  'Ngô Gia Huy',
  'Dương Thị Mai',
  'Lý Hoàng Phúc',
  'Phan Thị Ngọc Diệp',
  'Trịnh Văn Khoa',
  'Đinh Thu Trang',
  'Mai Xuân Trường',
  'Võ Thị Kim Ngân',
  'Lâm Quang Vinh',
  'Tô Ngọc Hân',
  'Hồ Minh Triết',
  'Cao Thị Bích Phương',
  'Nguyễn Đình Khôi',
  'Trần Bảo Châu',
  'Lê Thanh Sơn',
  'Phạm Hải Yến',
  'Hoàng Gia Bảo',
  'Vũ Đức Thắng',
  'Đặng Thị Lan Anh',
  'Bùi Minh Quân',
  'Đỗ Phương Thảo',
];

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

export const PRODUCTION_CANDIDATES: ProductionCandidate[] = NAMES.map(name => ({
  name,
  email: `${slugify(name)}@example.com`,
}));

const TRACKS = [
  {
    title: 'Backend Developer',
    skills: ['Node.js', 'NestJS', 'TypeScript', 'MongoDB', 'Redis', 'Docker'],
    project: 'order management API',
  },
  {
    title: 'Frontend Developer',
    skills: ['React', 'Next.js', 'TypeScript', 'Redux', 'Tailwind CSS', 'Jest'],
    project: 'e-commerce storefront',
  },
  {
    title: 'Java Developer',
    skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Microservices', 'Kafka', 'Docker'],
    project: 'payment processing service',
  },
  {
    title: 'Mobile Developer',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'REST API', 'Redux'],
    project: 'food delivery mobile app',
  },
  {
    title: 'DevOps Engineer',
    skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
    project: 'multi-environment CI/CD pipeline',
  },
  {
    title: 'Data Engineer',
    skills: ['Python', 'Apache Spark', 'Kafka', 'SQL', 'Airflow', 'AWS S3'],
    project: 'analytics data pipeline',
  },
  {
    title: 'Machine Learning Engineer',
    skills: ['Python', 'PyTorch', 'TensorFlow', 'MLflow', 'FastAPI', 'Docker'],
    project: 'product recommendation model',
  },
  {
    title: 'QA Automation Engineer',
    skills: ['Cypress', 'Playwright', 'Selenium', 'Jest', 'CI/CD', 'Python'],
    project: 'end-to-end regression suite',
  },
];

const SCHOOLS = [
  'Hanoi University of Science and Technology',
  'Ho Chi Minh City University of Technology',
  'University of Information Technology - VNU-HCM',
  'VNU University of Engineering and Technology',
  'Posts and Telecommunications Institute of Technology',
  'FPT University',
  'Da Nang University of Science and Technology',
];

const EMPLOYERS = [
  'FPT Software',
  'VNG Corporation',
  'TMA Solutions',
  'Rikkeisoft',
  'Axon Active Vietnam',
  'KMS Technology',
  'Nash Tech',
  'Viettel Solutions',
];
const CITIES = ['Ha Noi', 'Ho Chi Minh City', 'Da Nang', 'Ha Noi', 'Ho Chi Minh City'];

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

export function createProductionCvProfiles(
  candidates: Array<ProductionCandidate & { _id: Types.ObjectId }>,
  now = new Date(),
): CvProfileSeed[] {
  return candidates.map((candidate, index) => {
    const track = TRACKS[index % TRACKS.length];
    const years = 1 + (index % 7);
    const startYear = now.getFullYear() - years;
    const updatedAt = addDays(now, (index * 2) % 30);
    const employer = EMPLOYERS[index % EMPLOYERS.length];
    const lead = track.skills.slice(0, 3).join(', ');
    const handle = slugify(candidate.name).replace(/\./g, '');

    return {
      userId: candidate._id,
      personalInfo: {
        fullName: candidate.name,
        title: track.title,
        avatar: null,
        phone: `09${String(10_000_000 + ((index * 7_919_031) % 89_999_999))}`.slice(0, 10),
        email: candidate.email,
        birthday: `${1992 + (index % 9)}-${String((index % 12) + 1).padStart(2, '0')}-${String(5 + (index % 20)).padStart(2, '0')}`,
        gender: index % 2 === 0 ? 'MALE' : 'FEMALE',
        address: CITIES[index % CITIES.length],
        personalLink: `https://github.com/${handle}`,
        bio: `${track.title} with ${years} year${years > 1 ? 's' : ''} of experience building products with ${lead}. Enjoys clean code, code review and learning new tools.`,
      },
      education: [
        {
          id: `edu-${index + 1}`,
          school: SCHOOLS[index % SCHOOLS.length],
          degree: 'Bachelor',
          field: index % 5 === 0 ? 'Information Technology' : 'Computer Science',
          startDate: `${startYear - 4}-09-01`,
          endDate: `${startYear}-06-30`,
          description:
            'Coursework in data structures, databases, networks and software engineering.',
        },
      ],
      experience: [
        {
          id: `exp-${index + 1}`,
          company: employer,
          position: track.title,
          startDate: `${startYear}-07-01`,
          endDate: 'Present',
          description: `Built and maintained production features with ${lead}; took part in code reviews and sprint planning.`,
        },
      ],
      skills: track.skills.map((name, i) => ({
        id: `skill-${index + 1}-${i + 1}`,
        name,
        level: i < 3 ? 'Advanced' : 'Intermediate',
      })),
      languages: [
        { id: `lang-${index + 1}-1`, name: 'Vietnamese', proficiency: 'Native' },
        {
          id: `lang-${index + 1}-2`,
          name: 'English',
          proficiency: index % 3 === 0 ? 'Fluent' : 'Intermediate',
        },
      ],
      projects: [
        {
          id: `project-${index + 1}`,
          name: `${track.project.charAt(0).toUpperCase()}${track.project.slice(1)}`,
          position: track.title,
          description: `Designed and implemented a ${track.project} using ${lead}.`,
          link: `https://github.com/${handle}/${track.project.replace(/\s+/g, '-')}`,
        },
      ],
      certificates:
        index % 4 === 0
          ? [
              {
                id: `cert-${index + 1}`,
                name: track.title.includes('DevOps')
                  ? 'AWS Certified Solutions Architect - Associate'
                  : 'IELTS 6.5',
                issuer: track.title.includes('DevOps') ? 'Amazon Web Services' : 'British Council',
                date: `${now.getFullYear() - 1}-06-15`,
              },
            ]
          : [],
      awards: [],
      isActive: true,
      lastUpdated: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    };
  });
}
