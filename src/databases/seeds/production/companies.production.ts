import { COMPANIES_SEED_DATA } from '../data/companies.data';

export type ProductionCompany = {
  slug: string; // also the logo file name (logos/<slug>.png)
  name: string;
  address: string;
  description: string;
  website: string;
  numberOfEmployees: number;
  city: 'Ha Noi' | 'Ho Chi Minh City';
  sector: 'outsourcing' | 'ecommerce' | 'fintech' | 'product' | 'enterprise';
};

// Existing seed companies reused as-is (only the logo is new); employee counts and addresses are approximate.
const reused: Array<[string, string, ProductionCompany['city'], ProductionCompany['sector']]> = [
  ['FPT Software', 'fpt-software', 'Ha Noi', 'outsourcing'],
  ['VNG Corporation', 'vng-corporation', 'Ho Chi Minh City', 'product'],
  ['Vingroup Technology', 'vingroup-technology', 'Ha Noi', 'enterprise'],
  ['Tiki Corporation', 'tiki-corporation', 'Ho Chi Minh City', 'ecommerce'],
  ['MoMo', 'momo', 'Ho Chi Minh City', 'fintech'],
  ['Shopee Vietnam', 'shopee-vietnam', 'Ho Chi Minh City', 'ecommerce'],
  ['Grab Vietnam', 'grab-vietnam', 'Ho Chi Minh City', 'product'],
  ['Base.vn', 'base-vn', 'Ha Noi', 'product'],
  ['Axon Active Vietnam', 'axon-active-vietnam', 'Ho Chi Minh City', 'outsourcing'],
  ['Nash Tech', 'nash-tech', 'Ha Noi', 'outsourcing'],
  ['TMA Solutions', 'tma-solutions', 'Ho Chi Minh City', 'outsourcing'],
  ['Rikkeisoft', 'rikkeisoft', 'Ha Noi', 'outsourcing'],
  ['Cốc Cốc', 'coc-coc', 'Ha Noi', 'product'],
  ['Sky Mavis', 'sky-mavis', 'Ho Chi Minh City', 'product'],
  ['Trusting Social', 'trusting-social', 'Ho Chi Minh City', 'fintech'],
];

const added: ProductionCompany[] = [
  {
    slug: 'lazada-vietnam',
    name: 'Lazada Vietnam',
    address: 'Ho Chi Minh City, Vietnam',
    description:
      'Lazada Vietnam is a leading e-commerce marketplace in Southeast Asia, connecting millions of shoppers with local and international sellers through its app, logistics network and payment services.',
    website: 'https://www.lazada.vn',
    numberOfEmployees: 3000,
    city: 'Ho Chi Minh City',
    sector: 'ecommerce',
  },
  {
    slug: 'be-group',
    name: 'Be Group',
    address: 'Tan Binh District, Ho Chi Minh City',
    description:
      'Be Group is a Vietnamese super-app company offering ride-hailing, food delivery, express delivery and financial services to millions of users and driver partners.',
    website: 'https://be.com.vn',
    numberOfEmployees: 1500,
    city: 'Ho Chi Minh City',
    sector: 'product',
  },
  {
    slug: 'bosch-global-software-technologies',
    name: 'Bosch Global Software Technologies Vietnam',
    address: 'Etown Central, 11 Doan Van Bo, District 4, Ho Chi Minh City',
    description:
      'Bosch Global Software Technologies in Vietnam develops embedded, cloud and mobility software for the Bosch Group, from automotive systems to connected industrial and smart home solutions.',
    website: 'https://www.bosch.com.vn',
    numberOfEmployees: 2000,
    city: 'Ho Chi Minh City',
    sector: 'enterprise',
  },
  {
    slug: 'ahamove',
    name: 'Ahamove',
    address: 'Ho Chi Minh City, Vietnam',
    description:
      'Ahamove is an on-demand logistics platform delivering parcels, food and e-commerce orders within hours through a network of driver partners across Vietnam.',
    website: 'https://ahamove.com',
    numberOfEmployees: 800,
    city: 'Ho Chi Minh City',
    sector: 'product',
  },
  {
    slug: 'vnpay',
    name: 'VNPAY',
    address: '22 Lang Ha, Ba Dinh, Ha Noi',
    description:
      'VNPAY is a Vietnamese fintech company operating payment gateways, VNPAY-QR and digital banking services used by banks, merchants and consumers nationwide.',
    website: 'https://vnpay.vn',
    numberOfEmployees: 2500,
    city: 'Ha Noi',
    sector: 'fintech',
  },
  {
    slug: 'kiotviet',
    name: 'KiotViet',
    address: 'Ha Noi, Vietnam',
    description:
      'KiotViet provides sales management software for retail and F&B businesses in Vietnam, covering point of sale, inventory, customer management and omnichannel selling.',
    website: 'https://www.kiotviet.vn',
    numberOfEmployees: 700,
    city: 'Ha Noi',
    sector: 'product',
  },
  {
    slug: 'vinfast',
    name: 'VinFast',
    address: 'Dinh Vu - Cat Hai Economic Zone, Hai Phong',
    description:
      'VinFast is a Vietnamese electric vehicle manufacturer building smart EVs, with software teams working on connected car platforms, battery management and the mobile app ecosystem.',
    website: 'https://vinfastauto.com',
    numberOfEmployees: 20000,
    city: 'Ha Noi',
    sector: 'enterprise',
  },
  {
    slug: 'techcombank',
    name: 'Techcombank',
    address: '191 Ba Trieu, Hai Ba Trung, Ha Noi',
    description:
      'Techcombank is one of the largest private commercial banks in Vietnam, known for its digital banking platform and a large in-house technology and data organization.',
    website: 'https://techcombank.com',
    numberOfEmployees: 12000,
    city: 'Ha Noi',
    sector: 'fintech',
  },
  {
    slug: 'fpt-telecom',
    name: 'FPT Telecom',
    address: 'FPT Tower, 10 Pham Van Bach, Cau Giay, Ha Noi',
    description:
      'FPT Telecom is a major Vietnamese internet and telecommunications provider offering fiber broadband, TV and cloud services, with large in-house software and network engineering teams.',
    website: 'https://fpt.vn',
    numberOfEmployees: 9000,
    city: 'Ha Noi',
    sector: 'enterprise',
  },
  {
    slug: 'masan-group',
    name: 'Masan Group',
    address: 'Central Plaza, 17 Le Duan, District 1, Ho Chi Minh City',
    description:
      'Masan Group is a leading Vietnamese consumer and retail conglomerate, investing in digital commerce, data and technology to power its retail and consumer goods businesses.',
    website: 'https://masangroup.com',
    numberOfEmployees: 30000,
    city: 'Ho Chi Minh City',
    sector: 'enterprise',
  },
];

const byName = new Map(COMPANIES_SEED_DATA.map(company => [company.name, company]));

export const PRODUCTION_COMPANIES: ProductionCompany[] = [
  ...reused.map(([name, slug, city, sector]) => {
    const base = byName.get(name);

    if (!base) {
      throw new Error(`Company not found in COMPANIES_SEED_DATA: ${name}`);
    }

    return {
      slug,
      name: base.name,
      address: base.address,
      description: base.description,
      website: base.website,
      numberOfEmployees: base.numberOfEmployees,
      city,
      sector,
    };
  }),
  ...added,
];
