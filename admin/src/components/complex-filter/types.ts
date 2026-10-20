import type { CrudOperators, LogicalFilter } from "@refinedev/core";

export type FilterFieldType = "text" | "select" | "date" | "number";

export type FilterOperator = LogicalFilter["operator"];

export interface FilterOperatorOption {
  label: string;
  value: FilterOperator;
}

export interface FilterSelectOption {
  label: string;
  value: string;
}

export interface FilterFieldConfig {
  id: string; // The database column or field key (e.g. 'channel_id', 'processing_status')
  label: string; // User-facing label (e.g. 'Channel', 'Pipeline Status')
  type: FilterFieldType;
  operators?: FilterOperatorOption[];
  options?: FilterSelectOption[]; // Required if type === 'select'
  placeholder?: string;
  quickFilter?: boolean; // Whether to show as a quick filter button in top bar
}

export interface FilterCondition {
  id: string; // Unique client-side ID for the row key
  field: string;
  operator: FilterOperator;
  value: string;
}
