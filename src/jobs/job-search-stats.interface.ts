export interface JobSalarySummary {
  id: string;
  name: string;
  company: string;
  salary: number;
}

export interface JobSearchStats {
  total: number;
  highestSalary: JobSalarySummary | null;
}
