export const brands = [
  { id: 'silvertree', name: 'Silvertree Restaurants' },
  { id: 'gordon-grill', name: 'Gordon Grill' },
  { id: 'normans-cafe', name: "Norman's Cafe" },
  { id: 'nishas-boulangerie', name: "Nisha's Boulangerie" },
  { id: 'binjai-juice-bar', name: 'Binjai Juice Bar' },
  { id: 'family-onigiri', name: 'Family Onigiri' },
]

export const companies = [
  // Companies from the assessment prototype
  {
    id: 'silvertree-oris',
    name: 'Silvertree Oris Sdn Bhd',
  },
  {
    id: 'silvertree-binjai',
    name: 'Silvertree Binjai Sdn Bhd',
  },
  {
    id: 'silvertree-us',
    name: 'Silvertree US Sdn Bhd',
  },

  // Additional fictional companies
  {
    id: 'gordon-dining',
    name: 'Gordon Grill Dining Sdn Bhd',
  },
  {
    id: 'normans-operations',
    name: "Norman's Cafe Operations Sdn Bhd",
  },
  {
    id: 'nishas-bakery',
    name: "Nisha's Bakery Sdn Bhd",
  },
  {
    id: 'nishas-retail',
    name: "Nisha's Retail Sdn Bhd",
  },
  {
    id: 'binjai-juice',
    name: 'Binjai Juice Ventures Sdn Bhd',
  },
  {
    id: 'family-foods',
    name: 'Family Onigiri Foods Sdn Bhd',
  },
]

export const outlets = [
  // Silvertree Restaurants - original prototype
  {
    id: 'st-001',
    brandId: 'silvertree',
    companyId: 'silvertree-oris',
    name: 'Binjai Park',
    outletCode: 'ST-BP-01',
  },
  {
    id: 'st-002',
    brandId: 'silvertree',
    companyId: 'silvertree-oris',
    name: 'Binjai Park',
    outletCode: 'ST-BP-02',
  },
  {
    id: 'st-003',
    brandId: 'silvertree',
    companyId: 'silvertree-binjai',
    name: 'Binjai Park',
    outletCode: 'ST-BP-03',
  },
  {
    id: 'st-004',
    brandId: 'silvertree',
    companyId: 'silvertree-us',
    name: 'Union Square',
    outletCode: 'ST-US-01',
  },

  // Gordon Grill
  {
    id: 'gg-001',
    brandId: 'gordon-grill',
    companyId: 'gordon-dining',
    name: 'Pavilion Kuala Lumpur',
    outletCode: 'GG-PAV-01',
  },
  {
    id: 'gg-002',
    brandId: 'gordon-grill',
    companyId: 'gordon-dining',
    name: 'Mid Valley Megamall',
    outletCode: 'GG-MV-02',
  },

  // Norman's Cafe
  {
    id: 'nc-001',
    brandId: 'normans-cafe',
    companyId: 'normans-operations',
    name: 'SS15 Subang Jaya',
    outletCode: 'NC-SS15-01',
  },
  {
    id: 'nc-002',
    brandId: 'normans-cafe',
    companyId: 'normans-operations',
    name: 'Bangsar South',
    outletCode: 'NC-BS-02',
  },

  // Nisha's Boulangerie
  {
    id: 'nb-001',
    brandId: 'nishas-boulangerie',
    companyId: 'nishas-bakery',
    name: 'Mont Kiara',
    outletCode: 'NB-MK-01',
  },
  {
    id: 'nb-002',
    brandId: 'nishas-boulangerie',
    companyId: 'nishas-retail',
    name: 'TTDI',
    outletCode: 'NB-TTDI-02',
  },

  // Binjai Juice Bar
  {
    id: 'bj-001',
    brandId: 'binjai-juice-bar',
    companyId: 'binjai-juice',
    name: 'Suria KLCC',
    outletCode: 'BJ-KLCC-01',
  },
  {
    id: 'bj-002',
    brandId: 'binjai-juice-bar',
    companyId: 'binjai-juice',
    name: 'The Gardens Mall',
    outletCode: 'BJ-TGM-02',
  },

  // Family Onigiri
  {
    id: 'fo-001',
    brandId: 'family-onigiri',
    companyId: 'family-foods',
    name: 'Sunway Pyramid',
    outletCode: 'FO-SP-01',
  },
  {
    id: 'fo-002',
    brandId: 'family-onigiri',
    companyId: 'family-foods',
    name: '1 Utama',
    outletCode: 'FO-1U-02',
  },
]

// Reference scenario from Screen 2 of the assessment.
// This is not the default credit allocation for new quotations.
export const prototypeExample = {
  brandId: 'silvertree',
  topUpsByOutletId: {
    'st-001': 300,
    'st-002': 300,
    'st-003': 300,
    'st-004': 0,
  },
}