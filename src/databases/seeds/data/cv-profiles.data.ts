import { Types } from 'mongoose';

export type CandidateUserRef = {
  _id: Types.ObjectId;
  name: string;
  email: string;
};

export type CvProfileSeed = {
  userId: Types.ObjectId;
  personalInfo: {
    fullName: string;
    title: string;
    avatar: string | null;
    phone: string;
    email: string;
    birthday: string;
    gender: string;
    address: string;
    personalLink: string;
    bio: string;
  };
  education: Array<{
    id: string;
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  experience: Array<{
    id: string;
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    level: string;
  }>;
  languages: Array<{
    id: string;
    name: string;
    proficiency: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    position: string;
    description: string;
    link: string;
  }>;
  certificates: Array<{
    id: string;
    name: string;
    issuer: string;
    date: string;
  }>;
  awards: Array<{
    id: string;
    name: string;
    date: string;
    description: string;
  }>;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
};

const schools = [
  'Ho Chi Minh City University of Technology',
  'Hanoi University of Science and Technology',
  'University of Information Technology',
  'FPT University',
  'Da Nang University of Science and Technology',
];

const addresses = ['Ha Noi', 'Ho Chi Minh City', 'Da Nang', 'Can Tho', 'Hai Phong'];

const skillTracks = [
  {
    title: 'Backend Developer',
    skills: ['Node.js', 'NestJS', 'TypeScript', 'MongoDB', 'Redis', 'REST API'],
  },
  {
    title: 'Frontend Developer',
    skills: ['React', 'Next.js', 'TypeScript', 'Redux', 'Tailwind CSS', 'REST API'],
  },
  {
    title: 'Full Stack Developer',
    skills: ['Java', 'Spring Boot', 'React', 'PostgreSQL', 'Docker', 'REST API'],
  },
  {
    title: 'Mobile Developer',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'REST API'],
  },
  {
    title: 'DevOps Engineer',
    skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
  },
  {
    title: 'Data Engineer',
    skills: ['Python', 'Apache Spark', 'Kafka', 'SQL', 'Airflow', 'AWS S3'],
  },
  {
    title: 'Machine Learning Engineer',
    skills: ['Python', 'PyTorch', 'TensorFlow', 'MLflow', 'Docker', 'FastAPI'],
  },
  {
    title: 'QA Automation Engineer',
    skills: ['Cypress', 'Playwright', 'Jest', 'Selenium', 'CI/CD', 'Python'],
  },
];

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export function getCandidateSkillTrack(index: number) {
  return skillTracks[index % skillTracks.length];
}

export function createCvProfilesSeedData(candidates: CandidateUserRef[]): CvProfileSeed[] {
  const now = new Date();

  return candidates.map((candidate, index) => {
    const track = getCandidateSkillTrack(index);
    const yearsOfExperience = index % 6;
    const updatedAt = addDays(now, -(index % 30));

    return {
      userId: candidate._id,
      personalInfo: {
        fullName: candidate.name,
        title: track.title,
        avatar: null,
        phone: `09${String(10000000 + index * 137).slice(0, 8)}`,
        email: candidate.email,
        birthday: `${1993 + (index % 8)}-${String((index % 12) + 1).padStart(2, '0')}-15`,
        gender: index % 2 === 0 ? 'MALE' : 'FEMALE',
        address: addresses[index % addresses.length],
        personalLink: `https://github.com/seed-candidate-${String(index + 1).padStart(3, '0')}`,
        bio: `${track.title} with ${yearsOfExperience + 1} years of experience building production software products.`,
      },
      education: [
        {
          id: `seed-edu-${index + 1}`,
          school: schools[index % schools.length],
          degree: 'Bachelor',
          field: 'Computer Science',
          startDate: '2014-09-01',
          endDate: '2018-06-30',
          description:
            'Focused on software engineering, data structures, databases, and web application development.',
        },
      ],
      experience: [
        {
          id: `seed-exp-${index + 1}`,
          company: index % 3 === 0 ? 'Product Studio Vietnam' : 'Digital Solutions Vietnam',
          position: track.title,
          startDate: `${2019 + (index % 3)}-01-01`,
          endDate: 'Present',
          description: `Delivered production features using ${track.skills.slice(0, 4).join(', ')}.`,
        },
      ],
      skills: track.skills.map((skill, skillIndex) => ({
        id: `seed-skill-${index + 1}-${skillIndex + 1}`,
        name: skill,
        level: skillIndex < 3 ? 'Advanced' : 'Intermediate',
      })),
      languages: [
        { id: `seed-lang-${index + 1}-1`, name: 'Vietnamese', proficiency: 'Native' },
        {
          id: `seed-lang-${index + 1}-2`,
          name: 'English',
          proficiency: index % 4 === 0 ? 'Fluent' : 'Intermediate',
        },
      ],
      projects: [
        {
          id: `seed-project-${index + 1}`,
          name: `${track.title} Portfolio Platform`,
          position: track.title,
          description: `Built a demo project using ${track.skills.slice(0, 3).join(', ')}.`,
          link: `https://github.com/seed-candidate-${String(index + 1).padStart(3, '0')}/portfolio`,
        },
      ],
      certificates:
        index % 3 === 0
          ? [
              {
                id: `seed-cert-${index + 1}`,
                name: track.title.includes('DevOps')
                  ? 'AWS Certified Cloud Practitioner'
                  : 'Professional Scrum Developer',
                issuer: track.title.includes('DevOps') ? 'Amazon Web Services' : 'Scrum.org',
                date: '2024-06-15',
              },
            ]
          : [],
      awards:
        index % 11 === 0
          ? [
              {
                id: `seed-award-${index + 1}`,
                name: 'Internal Hackathon Finalist',
                date: '2024-12-01',
                description: 'Recognized for building a practical product prototype.',
              },
            ]
          : [],
      isActive: true,
      lastUpdated: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    };
  });
}
