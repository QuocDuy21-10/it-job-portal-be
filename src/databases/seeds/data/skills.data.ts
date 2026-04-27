type SkillSeed = {
  label: string;
  slug: string;
  aliases: string[];
  category: string;
  description: string;
  isActive: boolean;
};

const buildSlug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const createSkill = (
  label: string,
  aliases: string[],
  category: string,
  description: string,
): SkillSeed => ({
  label,
  slug: buildSlug(label),
  aliases,
  category,
  description,
  isActive: true,
});

export const SKILLS_SEED_DATA: SkillSeed[] = [
  createSkill(
    'Node.js',
    ['node', 'nodejs', 'node js'],
    'Backend',
    'JavaScript runtime for backend services',
  ),
  createSkill(
    'NestJS',
    ['nestjs framework'],
    'Backend',
    'Progressive Node.js framework for server-side applications',
  ),
  createSkill('TypeScript', ['ts'], 'Programming Language', 'Typed superset of JavaScript'),
  createSkill('MongoDB', ['mongo', 'mongo db'], 'Database', 'Document-oriented NoSQL database'),
  createSkill('Redis', ['redis cache'], 'Database', 'In-memory data store and cache'),
  createSkill('React', ['react.js', 'reactjs', 'react js'], 'Frontend', 'Frontend UI library'),
  createSkill(
    'Redux',
    ['redux toolkit', 'rtk'],
    'Frontend',
    'State management library for JavaScript apps',
  ),
  createSkill('Tailwind CSS', ['tailwind'], 'Frontend', 'Utility-first CSS framework'),
  createSkill('REST API', ['rest', 'restful api'], 'Backend', 'RESTful API design and integration'),
  createSkill(
    'React Native',
    ['reactnative', 'rn'],
    'Mobile',
    'Framework for building native mobile apps with React',
  ),
  createSkill('iOS', ['ios development'], 'Mobile', 'Apple mobile platform development'),
  createSkill('Android', ['android development'], 'Mobile', 'Google mobile platform development'),
  createSkill('AWS', ['amazon web services'], 'Cloud', 'Amazon cloud platform'),
  createSkill('Kubernetes', ['k8s'], 'DevOps', 'Container orchestration platform'),
  createSkill(
    'Docker',
    ['containers', 'containerization'],
    'DevOps',
    'Container packaging and runtime platform',
  ),
  createSkill('Terraform', ['iac'], 'DevOps', 'Infrastructure as code provisioning tool'),
  createSkill(
    'CI/CD',
    ['cicd', 'continuous integration', 'continuous delivery'],
    'DevOps',
    'Build and deployment automation practices',
  ),
  createSkill(
    'Linux',
    ['linux administration'],
    'DevOps',
    'Linux operating system usage and administration',
  ),
  createSkill(
    'Python',
    ['python3'],
    'Programming Language',
    'General-purpose programming language',
  ),
  createSkill(
    'Apache Spark',
    ['spark'],
    'Data',
    'Distributed processing engine for big data workloads',
  ),
  createSkill('Kafka', ['apache kafka'], 'Data', 'Distributed event streaming platform'),
  createSkill(
    'SQL',
    ['structured query language'],
    'Database',
    'Relational querying and data manipulation',
  ),
  createSkill('Airflow', ['apache airflow'], 'Data', 'Workflow orchestration platform'),
  createSkill('AWS S3', ['s3'], 'Cloud', 'Amazon object storage service'),
  createSkill('TensorFlow', ['tf'], 'AI/ML', 'Machine learning framework from Google'),
  createSkill('PyTorch', ['torch'], 'AI/ML', 'Machine learning framework from Meta'),
  createSkill('scikit-learn', ['sklearn'], 'AI/ML', 'Machine learning toolkit for Python'),
  createSkill('MLflow', ['ml flow'], 'AI/ML', 'Machine learning lifecycle platform'),
  createSkill('Next.js', ['next', 'nextjs'], 'Frontend', 'React framework for full-stack web apps'),
  createSkill('Java', ['java se'], 'Programming Language', 'General-purpose JVM language'),
  createSkill(
    'Spring Boot',
    ['springboot'],
    'Backend',
    'Java framework for production-ready services',
  ),
  createSkill(
    'PostgreSQL',
    ['postgres', 'psql', 'pg'],
    'Database',
    'Open-source relational database',
  ),
  createSkill('Selenium', ['selenium webdriver'], 'Testing', 'Browser automation framework'),
  createSkill('Cypress', ['cypress io'], 'Testing', 'End-to-end testing framework for web apps'),
  createSkill('Jest', ['jestjs'], 'Testing', 'JavaScript testing framework'),
  createSkill(
    'Playwright',
    ['playwright testing'],
    'Testing',
    'Cross-browser automation and testing framework',
  ),
  createSkill(
    'GCP',
    ['google cloud', 'google cloud platform'],
    'Cloud',
    'Google Cloud Platform services',
  ),
  createSkill('Azure', ['microsoft azure'], 'Cloud', 'Microsoft cloud platform'),
  createSkill(
    'Solution Design',
    ['solution architecture'],
    'Architecture',
    'Designing scalable technical solutions',
  ),
  createSkill(
    'Microservices',
    ['micro services'],
    'Architecture',
    'Distributed service architecture pattern',
  ),
  createSkill(
    'Go',
    ['golang'],
    'Programming Language',
    'Compiled systems programming language from Google',
  ),
  createSkill(
    'Swift',
    ['swift language'],
    'Programming Language',
    'Programming language for Apple platforms',
  ),
  createSkill('SwiftUI', ['swift ui'], 'Mobile', 'Declarative UI framework for Apple platforms'),
  createSkill('Combine', ['apple combine'], 'Mobile', 'Reactive framework for Apple platforms'),
  createSkill('CoreData', ['core data'], 'Mobile', 'Persistence framework for Apple platforms'),
  createSkill('Xcode', ['xcode ide'], 'Tooling', 'IDE for Apple platform development'),
  createSkill(
    'Kotlin',
    ['kotlin language'],
    'Programming Language',
    'Modern JVM language for Android and backend',
  ),
  createSkill('Jetpack Compose', ['compose'], 'Mobile', 'Declarative Android UI toolkit'),
  createSkill(
    'Coroutines',
    ['kotlin coroutines'],
    'Programming Concept',
    'Asynchronous programming model in Kotlin',
  ),
  createSkill(
    'MVVM',
    ['model view viewmodel'],
    'Architecture',
    'Presentation architecture pattern',
  ),
  createSkill('Android SDK', ['android sdk tools'], 'Mobile', 'Android platform SDK and APIs'),
  createSkill(
    'Prometheus',
    ['prometheus monitoring'],
    'DevOps',
    'Metrics collection and monitoring system',
  ),
  createSkill('Grafana', ['grafana dashboards'], 'DevOps', 'Observability and dashboard platform'),
  createSkill(
    'Solidity',
    ['solidity smart contracts'],
    'Blockchain',
    'Smart contract language for EVM chains',
  ),
  createSkill('Hardhat', ['hardhat framework'], 'Blockchain', 'Ethereum development environment'),
  createSkill('Ethers.js', ['ethersjs', 'ethers js'], 'Blockchain', 'Ethereum JavaScript library'),
  createSkill(
    'Web3',
    ['web3.js', 'web3js'],
    'Blockchain',
    'Decentralized application integration stack',
  ),
  createSkill(
    'HuggingFace',
    ['hugging face'],
    'AI/ML',
    'Open-source ML models and tooling platform',
  ),
  createSkill('LangChain', ['lang chain'], 'AI/ML', 'Framework for LLM application orchestration'),
  createSkill(
    'Transformers',
    ['huggingface transformers'],
    'AI/ML',
    'Transformer model tooling and library',
  ),
  createSkill('FastAPI', ['fast api'], 'Backend', 'Python framework for APIs'),
  createSkill('Vue.js', ['vue', 'vuejs', 'vue js'], 'Frontend', 'Progressive frontend framework'),
  createSkill('HTML', ['html5'], 'Frontend', 'Markup language for web documents'),
  createSkill('CSS', ['css3'], 'Frontend', 'Style sheet language for web applications'),
  createSkill(
    'JavaScript',
    ['js', 'ecmascript', 'es6'],
    'Programming Language',
    'Core programming language for web development',
  ),
  createSkill('Git', ['git scm'], 'Tooling', 'Distributed version control system'),
  createSkill('OWASP', ['owasp top 10'], 'Security', 'Application security best practices'),
  createSkill(
    'Penetration Testing',
    ['pentest', 'pen testing'],
    'Security',
    'Security assessment through attack simulation',
  ),
  createSkill('Burp Suite', ['burp'], 'Security', 'Web security testing toolkit'),
  createSkill(
    'SAST/DAST',
    ['sast', 'dast'],
    'Security',
    'Static and dynamic application security testing',
  ),
  createSkill('Django', ['django framework'], 'Backend', 'Python web framework'),
  createSkill('Django REST Framework', ['drf'], 'Backend', 'REST API framework for Django'),
  createSkill('Celery', ['celery worker'], 'Backend', 'Distributed task queue for Python'),
  createSkill(
    'Team Leadership',
    ['tech leadership'],
    'Leadership',
    'Leading engineering teams and delivery',
  ),
  createSkill(
    'Agile',
    ['scrum', 'kanban'],
    'Process',
    'Iterative product and delivery methodology',
  ),
  createSkill(
    'System Design',
    ['design systems', 'system architecture'],
    'Architecture',
    'Designing scalable application systems',
  ),
  createSkill(
    'OKRs',
    ['objectives and key results'],
    'Leadership',
    'Goal-setting framework for teams and organizations',
  ),
];
