/** Builds source files for the tests in the export formats of SPECS.md. */

const stockColumns = [
  "\uFEFFAutocount SKU",
  "Condition",
  "Category",
  "Retail Price",
  "Promotion Price",
  "Model",
  "Total Stock\n(Excld Sabah)",
  "Color",
  "Chipset",
  "Storage",
  "RAM",
  "Generation",
  "Size",
  "Case Material",
  "Checkout Link",
  "Video Link",
  "Portrait Video",
  "XOX Bundle Price",
  "Last Month Price",
  "No stock at all",
  "Store Lookup",
];

export type StockRow = Partial<Record<(typeof stockColumns)[number], string>>;

/** A stock row. The defaults give an in-stock used iPhone 12 with no optional values. */
export function stockRow(values: StockRow): StockRow {
  return {
    Condition: "USED",
    Category: "U_IPHONE",
    "Retail Price": "1000",
    "No stock at all": "Stock Present",
    "Store Lookup": "@Low Yat Plaza",
    ...values,
  };
}

export function stockCsv(rows: StockRow[]): string {
  const lines = [
    stockColumns,
    ...rows.map((row) => stockColumns.map((column) => row[column] ?? "")),
  ];
  return lines.map((cells) => cells.map(quote).join(",")).join("\r\n");
}

const tradeInColumns = [
  "Category",
  "Model",
  "Generation",
  "ModelNumber",
  "Size",
  "Storage",
  "Year",
  "Chipset",
  "Material",
  "Battery",
  "LCD",
  "RRP",
  "Connectivity",
  "MinorScratch",
  "MinorDent",
  "TradeinPrice",
];

export type TradeInRow = Partial<
  Record<(typeof tradeInColumns)[number], string>
>;

/** A reference file. A row with `TradeinPrice` absent ends before the price column. */
export function tradeInCsv(rows: TradeInRow[]): string {
  const lines = rows.map((row) => {
    const columns =
      "TradeinPrice" in row ? tradeInColumns : tradeInColumns.slice(0, -1);
    return columns.map((column) => quote(row[column] ?? "")).join(",");
  });
  return [tradeInColumns.join(","), ...lines].join("\n");
}

function quote(cell: string): string {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export interface CampaignFixture {
  name: string;
  discount_type?: string;
  discount_value?: number;
  min_spend?: number;
  start_date?: string;
  end_date?: string;
  stackable?: boolean;
  eligible_models?: string[];
  priority?: number;
  description?: string;
  voucher_code?: string;
}

export function promotionsYaml(campaigns: CampaignFixture[]): string {
  return Bun.YAML.stringify(
    campaigns.map((campaign) => ({
      discount_type: "fixed",
      discount_value: 100,
      min_spend: 0,
      stackable: true,
      priority: 1,
      ...campaign,
    })),
  );
}
