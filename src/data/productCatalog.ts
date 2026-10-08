export interface ProductCatalogBrand {
  name: string;
  productTypes: string[];
}

export interface ProductCatalogCategory {
  category: string;
  description?: string;
  brands: ProductCatalogBrand[];
}

export const PRODUCT_CATALOG: ProductCatalogCategory[] = [
  {
    category: 'SOC as A Service',
    description: 'Managed Security Operations Center Services',
    brands: [
      { name: 'Google SecOps', productTypes: ['SOC as a Service', 'SIEM / SOAR', 'Chronicle', 'GTI'] },
      { name: 'DAS', productTypes: ['SOC as a Service', 'Managed SOC', '24/7 Monitoring', 'PAM'] },
    ],
  },
  {
    category: 'Health Check',
    description: 'Security Assessments, Audits & Governance',
    brands: [
      { name: 'Vulnerability Assessment', productTypes: ['Internal / External VA', 'Network VA', 'Cloud VA'] },
      { name: 'Penetration Testing', productTypes: ['Web App Pentest', 'Mobile Pentest', 'Network Pentest', 'API Pentest'] },
      { name: 'Cybersecurity Maturity Assessment', productTypes: ['NIST CSF', 'ISO 27001', 'CIS Controls'] },
      { name: 'AI/Data Governance', productTypes: ['Data Governance', 'AI Security & Compliance', 'Data Protection'] },
      { name: 'Incident Response', productTypes: ['IR Retainer', 'Emergency Incident Response', 'Tabletop Exercise'] },
      { name: 'Digital Forensics', productTypes: ['Digital Forensic Investigation', 'Malware Analysis', 'Evidence Collection'] },
      { name: 'Cybersecurity Insurance', productTypes: ['Readiness Assessment', 'Underwriting Compliance'] },
    ],
  },
  {
    category: 'Implementation',
    description: 'Security Solution Deployment & Integration',
    brands: [
      { name: 'Google', productTypes: ['SecOps', 'GTI'] },
      { name: 'Mandiant', productTypes: ['Red Team', 'IR'] },
      { name: 'DAS', productTypes: ['SOC', 'PAM'] },
      { name: 'Idira', productTypes: ['PAM'] },
      { name: 'Crowdstrike', productTypes: ['EDR', 'NDR', 'XDR', 'TI'] },
      { name: 'Sentinel One', productTypes: ['EDR', 'NDR', 'XDR'] },
      { name: 'Sophos', productTypes: ['EDR', 'NDR', 'XDR'] },
      { name: 'Bitdefender', productTypes: ['EDR', 'NDR', 'XDR'] },
      { name: 'TrendAI', productTypes: ['EDR', 'NDR', 'XDR'] },
      { name: 'Vectra', productTypes: ['NDR'] },
      { name: 'Recorded Future', productTypes: ['TI'] },
      { name: 'Zscaler', productTypes: ['ZTNA', 'SASE', 'ALL'] },
      { name: 'Fortinet', productTypes: ['Firewall'] },
      { name: 'Cloudflare', productTypes: ['WAF'] },
      { name: 'Chrome Enterprise', productTypes: ['Enterprise Browser', 'Core', 'Premium'] },
      { name: 'Prisma Browser', productTypes: ['Enterprise Browser', 'SASE Integration'] },
      { name: 'Forcepoint', productTypes: ['DLP', 'Web Security', 'CASB'] },
    ],
  },
];

export const getBrandsForCategory = (categoryName?: string): ProductCatalogBrand[] => {
  if (!categoryName) return [];
  const found = PRODUCT_CATALOG.find(c => c.category.toLowerCase() === categoryName.toLowerCase());
  return found ? found.brands : [];
};

export const getProductTypesForBrand = (categoryName?: string, brandName?: string): string[] => {
  if (!categoryName || !brandName) return [];
  const brands = getBrandsForCategory(categoryName);
  const normalized = brandName.toLowerCase() === 'cyberark' ? 'idira' : brandName.toLowerCase();
  const found = brands.find(b => b.name.toLowerCase() === normalized);
  return found ? found.productTypes : [];
};
