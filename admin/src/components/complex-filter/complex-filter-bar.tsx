import React, { useState, useEffect, useMemo } from "react";
import type { CrudFilter, CrudOperators, LogicalFilter } from "@refinedev/core";
import {
  Filter,
  Plus,
  Trash2,
  X,
  ChevronDown,
  RotateCcw,
  Check,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  FilterFieldConfig,
  FilterCondition,
  FilterOperatorOption,
  FilterFieldType,
  FilterOperator,
} from "./types";

const DEFAULT_TEXT_OPERATORS: FilterOperatorOption[] = [
  { label: "contains", value: "contains" },
  { label: "equals", value: "eq" },
  { label: "starts with", value: "startswith" },
  { label: "ends with", value: "endswith" },
  { label: "does not equal", value: "ne" },
  { label: "is set", value: "nnull" },
  { label: "is empty", value: "null" },
];

const DEFAULT_SELECT_OPERATORS: FilterOperatorOption[] = [
  { label: "equals", value: "eq" },
  { label: "does not equal", value: "ne" },
  { label: "is set", value: "nnull" },
  { label: "is empty", value: "null" },
];

const DEFAULT_DATE_OPERATORS: FilterOperatorOption[] = [
  { label: "on or after", value: "gte" },
  { label: "on or before", value: "lte" },
  { label: "equals", value: "eq" },
  { label: "after", value: "gt" },
  { label: "before", value: "lt" },
];

const DEFAULT_NUMBER_OPERATORS: FilterOperatorOption[] = [
  { label: "equals", value: "eq" },
  { label: "greater than", value: "gt" },
  { label: "less than", value: "lt" },
  { label: "greater or equal", value: "gte" },
  { label: "less or equal", value: "lte" },
  { label: "does not equal", value: "ne" },
];

function getOperatorsForType(type: FilterFieldType): FilterOperatorOption[] {
  switch (type) {
    case "select":
      return DEFAULT_SELECT_OPERATORS;
    case "date":
      return DEFAULT_DATE_OPERATORS;
    case "number":
      return DEFAULT_NUMBER_OPERATORS;
    case "text":
    default:
      return DEFAULT_TEXT_OPERATORS;
  }
}

function getDefaultOperatorForType(type: FilterFieldType): FilterOperator {
  switch (type) {
    case "select":
      return "eq";
    case "date":
      return "gte";
    case "number":
      return "eq";
    case "text":
    default:
      return "contains";
  }
}

export interface ComplexFilterBarProps {
  fields: FilterFieldConfig[];
  filters: CrudFilter[];
  onFiltersChange: (filters: CrudFilter[]) => void;
  className?: string;
  showQuickFilters?: boolean;
}

export const ComplexFilterBar: React.FC<ComplexFilterBarProps> = ({
  fields,
  filters,
  onFiltersChange,
  className,
  showQuickFilters = true,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [draftConditions, setDraftConditions] = useState<FilterCondition[]>([]);

  // Map fields by id for quick lookup
  const fieldMap = useMemo(() => {
    const map = new Map<string, FilterFieldConfig>();
    fields.forEach((f) => map.set(f.id, f));
    return map;
  }, [fields]);

  // Extract logical filters from Refine CrudFilter[]
  const activeLogicalFilters = useMemo(() => {
    const list: LogicalFilter[] = [];
    filters.forEach((f) => {
      if ("field" in f && f.field && f.operator) {
        list.push(f as LogicalFilter);
      }
    });
    return list;
  }, [filters]);

  // Initialize draft conditions when popover opens or active filters change
  useEffect(() => {
    if (activeLogicalFilters.length > 0) {
      const initial: FilterCondition[] = activeLogicalFilters.map(
        (filter, idx) => ({
          id: `cond-${idx}-${filter.field}-${Date.now()}`,
          field: filter.field,
          operator: filter.operator,
          value: filter.value === null || filter.value === undefined ? "" : String(filter.value),
        })
      );
      setDraftConditions(initial);
    } else {
      setDraftConditions([]);
    }
  }, [activeLogicalFilters, isPopoverOpen]);

  const handleOpenPopover = (open: boolean) => {
    if (open && draftConditions.length === 0) {
      // If opening and empty, add 1 default row
      const defaultField = fields[0];
      if (defaultField) {
        setDraftConditions([
          {
            id: `cond-init-${Date.now()}`,
            field: defaultField.id,
            operator: defaultField.operators?.[0]?.value || getDefaultOperatorForType(defaultField.type),
            value: "",
          },
        ]);
      }
    }
    setIsPopoverOpen(open);
  };

  const handleAddCondition = (fieldId?: string) => {
    const targetField = fieldId ? fieldMap.get(fieldId) || fields[0] : fields[0];
    if (!targetField) return;

    const newCond: FilterCondition = {
      id: `cond-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      field: targetField.id,
      operator: targetField.operators?.[0]?.value || getDefaultOperatorForType(targetField.type),
      value: "",
    };
    setDraftConditions((prev) => [...prev, newCond]);
  };

  const handleRemoveCondition = (condId: string) => {
    setDraftConditions((prev) => prev.filter((c) => c.id !== condId));
  };

  const handleConditionChange = (
    condId: string,
    updates: Partial<Omit<FilterCondition, "id">>
  ) => {
    setDraftConditions((prev) =>
      prev.map((c) => {
        if (c.id !== condId) return c;
        const updated = { ...c, ...updates };

        // If field changed, update operator and reset value
        if (updates.field && updates.field !== c.field) {
          const newFieldConfig = fieldMap.get(updates.field);
          if (newFieldConfig) {
            updated.operator =
              newFieldConfig.operators?.[0]?.value ||
              getDefaultOperatorForType(newFieldConfig.type);
            updated.value = "";
          }
        }
        return updated;
      })
    );
  };

  const handleApplyDraft = () => {
    const validCrudFilters: CrudFilter[] = [];

    draftConditions.forEach((c) => {
      // For null/nnull operators, value is not required
      if (c.operator === "null" || c.operator === "nnull") {
        validCrudFilters.push({
          field: c.field,
          operator: c.operator,
          value: null,
        });
      } else if (c.value && c.value.trim() !== "") {
        validCrudFilters.push({
          field: c.field,
          operator: c.operator,
          value: c.value.trim(),
        });
      }
    });

    onFiltersChange(validCrudFilters);
    setIsPopoverOpen(false);
  };

  const handleClearAll = () => {
    setDraftConditions([]);
    onFiltersChange([]);
    setIsPopoverOpen(false);
  };

  const handleRemoveSingleActiveFilter = (field: string, operator: FilterOperator) => {
    const updated = activeLogicalFilters.filter(
      (f) => !(f.field === field && f.operator === operator)
    );
    onFiltersChange(updated);
  };

  // Quick filter helpers
  const quickFilterFields = useMemo(() => {
    return fields.filter((f) => f.quickFilter !== false);
  }, [fields]);

  const getActiveFilterForField = (fieldId: string) => {
    return activeLogicalFilters.find((f) => f.field === fieldId);
  };

  const handleQuickFilterSelect = (fieldId: string, value: string) => {
    const fieldConfig = fieldMap.get(fieldId);
    if (!fieldConfig) return;

    const existingIndex = activeLogicalFilters.findIndex((f) => f.field === fieldId);
    const newFilters: CrudFilter[] = [...activeLogicalFilters];

    if (!value || value === "all") {
      // Remove filter if cleared
      if (existingIndex >= 0) {
        newFilters.splice(existingIndex, 1);
      }
    } else {
      const defaultOp = fieldConfig.operators?.[0]?.value || getDefaultOperatorForType(fieldConfig.type);
      if (existingIndex >= 0) {
        newFilters[existingIndex] = {
          field: fieldId,
          operator: defaultOp,
          value,
        };
      } else {
        newFilters.push({
          field: fieldId,
          operator: defaultOp,
          value,
        });
      }
    }

    onFiltersChange(newFilters);
  };

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Top Filter Bar: Main Filter Button + Quick Filter Pills (ERPNext style) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Main Advanced Filter Popover */}
        <Popover open={isPopoverOpen} onOpenChange={handleOpenPopover}>
          <PopoverTrigger asChild>
            <Button
              variant={activeLogicalFilters.length > 0 ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs font-medium transition-all shadow-sm",
                activeLogicalFilters.length > 0
                  ? "bg-primary text-primary-foreground shadow-primary/20"
                  : "bg-background text-foreground hover:bg-muted"
              )}
            >
              <Filter className="h-3.5 w-3.5 shrink-0" />
              <span>Filter</span>
              {activeLogicalFilters.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 px-1 text-[10px] font-bold bg-background/20 text-current rounded-full"
                >
                  {activeLogicalFilters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-[560px] p-4 shadow-xl border border-border/80 rounded-xl bg-card text-card-foreground"
          >
            <div className="flex flex-col gap-3.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-1 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-primary/10 text-primary">
                    <Filter className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground tracking-tight">
                      Filter Conditions
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Match all of the following rules (AND)
                    </p>
                  </div>
                </div>

                {draftConditions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-muted-foreground hover:text-destructive px-2"
                    onClick={() => setDraftConditions([])}
                  >
                    Clear rows
                  </Button>
                )}
              </div>

              {/* Conditions List */}
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {draftConditions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border/60">
                    <p>No filter conditions added yet.</p>
                    <p className="text-[11px] mt-0.5">
                      Click below to add a filter rule.
                    </p>
                  </div>
                ) : (
                  draftConditions.map((cond, index) => {
                    const fieldConfig = fieldMap.get(cond.field) || fields[0];
                    const operators =
                      fieldConfig?.operators ||
                      getOperatorsForType(fieldConfig?.type || "text");
                    const isNullOp =
                      cond.operator === "null" || cond.operator === "nnull";

                    return (
                      <div
                        key={cond.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/40 border border-border/40 group hover:border-border transition-colors"
                      >
                        {/* Index / Conjunction badge */}
                        <span className="text-[10px] font-mono font-medium text-muted-foreground w-7 shrink-0 text-center">
                          {index === 0 ? "Where" : "And"}
                        </span>

                        {/* Field Select */}
                        <div className="w-[140px] shrink-0">
                          <Select
                            value={cond.field}
                            onValueChange={(val) =>
                              handleConditionChange(cond.id, { field: val })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue placeholder="Field" />
                            </SelectTrigger>
                            <SelectContent>
                              {fields.map((f) => (
                                <SelectItem key={f.id} value={f.id} className="text-xs">
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Operator Select */}
                        <div className="w-[125px] shrink-0">
                          <Select
                            value={cond.operator}
                            onValueChange={(val) =>
                              handleConditionChange(cond.id, {
                                operator: val as FilterOperator,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue placeholder="Operator" />
                            </SelectTrigger>
                            <SelectContent>
                              {operators.map((op) => (
                                <SelectItem
                                  key={op.value}
                                  value={op.value}
                                  className="text-xs"
                                >
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Value Input */}
                        <div className="flex-1 min-w-[130px]">
                          {isNullOp ? (
                            <div className="h-8 px-2.5 rounded-md border border-border/40 bg-muted/60 flex items-center text-[11px] text-muted-foreground italic">
                              No value needed
                            </div>
                          ) : fieldConfig?.type === "select" && fieldConfig.options ? (
                            <Select
                              value={cond.value}
                              onValueChange={(val) =>
                                handleConditionChange(cond.id, { value: val })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs bg-background">
                                <SelectValue
                                  placeholder={
                                    fieldConfig.placeholder || "Select option..."
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldConfig.options.map((opt) => (
                                  <SelectItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : fieldConfig?.type === "date" ? (
                            <Input
                              type="date"
                              value={cond.value}
                              onChange={(e) =>
                                handleConditionChange(cond.id, {
                                  value: e.target.value,
                                })
                              }
                              className="h-8 text-xs bg-background"
                            />
                          ) : fieldConfig?.type === "number" ? (
                            <Input
                              type="number"
                              value={cond.value}
                              placeholder={fieldConfig?.placeholder || "Value..."}
                              onChange={(e) =>
                                handleConditionChange(cond.id, {
                                  value: e.target.value,
                                })
                              }
                              className="h-8 text-xs bg-background"
                            />
                          ) : (
                            <Input
                              type="text"
                              value={cond.value}
                              placeholder={fieldConfig?.placeholder || "Enter text..."}
                              onChange={(e) =>
                                handleConditionChange(cond.id, {
                                  value: e.target.value,
                                })
                              }
                              className="h-8 text-xs bg-background"
                            />
                          )}
                        </div>

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => handleRemoveCondition(cond.id)}
                          title="Remove condition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add condition button */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-dashed text-muted-foreground hover:text-foreground"
                  onClick={() => handleAddCondition()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Condition</span>
                </Button>

                {/* Footer action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={handleClearAll}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs font-medium px-3"
                    onClick={handleApplyDraft}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Quick Filter Chips (ERPNext style pill triggers) */}
        {showQuickFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {quickFilterFields.map((field) => {
              const activeFilter = getActiveFilterForField(field.id);
              const isActive = !!activeFilter;

              // Find label of active value if select
              let displayValue = activeFilter ? String(activeFilter.value) : "";
              if (isActive && field.options) {
                const foundOpt = field.options.find((o) => o.value === displayValue);
                if (foundOpt) displayValue = foundOpt.label;
              }

              if (field.type === "select" && field.options) {
                return (
                  <Popover key={field.id}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-normal border rounded-md transition-all gap-1.5",
                          isActive
                            ? "bg-primary/10 text-primary border-primary/30 font-medium"
                            : "bg-background text-muted-foreground border-border/80 hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        <span>{field.label}</span>
                        {isActive ? (
                          <span className="font-semibold text-foreground max-w-[100px] truncate">
                            : {displayValue}
                          </span>
                        ) : (
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[200px] p-1.5 shadow-md">
                      <div className="flex flex-col gap-0.5">
                        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b mb-1">
                          Filter by {field.label}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "justify-start h-7 text-xs font-normal",
                            !isActive && "font-semibold bg-muted"
                          )}
                          onClick={() => handleQuickFilterSelect(field.id, "all")}
                        >
                          <span className="flex-1 text-left">All</span>
                          {!isActive && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                        </Button>
                        {field.options.map((opt) => {
                          const isSelected = isActive && activeFilter?.value === opt.value;
                          return (
                            <Button
                              key={opt.value}
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "justify-start h-7 text-xs font-normal",
                                isSelected && "font-semibold bg-primary/10 text-primary"
                              )}
                              onClick={() =>
                                handleQuickFilterSelect(
                                  field.id,
                                  isSelected ? "all" : opt.value
                                )
                              }
                            >
                              <span className="flex-1 text-left truncate">{opt.label}</span>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }

              // Text quick filter
              return (
                <Popover key={field.id}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "h-8 px-2.5 text-xs font-normal border rounded-md transition-all gap-1.5",
                        isActive
                          ? "bg-primary/10 text-primary border-primary/30 font-medium"
                          : "bg-background text-muted-foreground border-border/80 hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <span>{field.label}</span>
                      {isActive ? (
                        <span className="font-semibold text-foreground max-w-[100px] truncate">
                          : {displayValue}
                        </span>
                      ) : (
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[220px] p-2.5 shadow-md">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.currentTarget.elements.namedItem("val") as HTMLInputElement).value;
                        handleQuickFilterSelect(field.id, input);
                      }}
                      className="flex flex-col gap-2"
                    >
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Filter {field.label}
                      </label>
                      <Input
                        name="val"
                        defaultValue={isActive ? String(activeFilter?.value || "") : ""}
                        placeholder={field.placeholder || `Search ${field.label}...`}
                        className="h-8 text-xs"
                        autoFocus
                      />
                      <div className="flex items-center justify-between pt-1">
                        {isActive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground px-2"
                            onClick={() => handleQuickFilterSelect(field.id, "all")}
                          >
                            Clear
                          </Button>
                        )}
                        <Button type="submit" size="sm" className="h-7 text-xs ml-auto">
                          Apply
                        </Button>
                      </div>
                    </form>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Filter Badges Shelf (shows applied filters with quick dismiss 'x') */}
      {activeLogicalFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">
            Active Filters:
          </span>
          {activeLogicalFilters.map((f, i) => {
            const fieldConfig = fieldMap.get(f.field);
            const fieldLabel = fieldConfig?.label || f.field;

            // Formulate human readable value
            let displayVal = String(f.value);
            if (f.operator === "null") displayVal = "is empty";
            else if (f.operator === "nnull") displayVal = "is set";
            else if (fieldConfig?.options) {
              const opt = fieldConfig.options.find((o) => o.value === String(f.value));
              if (opt) displayVal = opt.label;
            }

            // Human operator
            const opLabel =
              f.operator === "eq"
                ? "="
                : f.operator === "ne"
                ? "≠"
                : f.operator === "contains"
                ? "contains"
                : f.operator === "gte"
                ? "≥"
                : f.operator === "lte"
                ? "≤"
                : f.operator === "gt"
                ? ">"
                : f.operator === "lt"
                ? "<"
                : f.operator;

            return (
              <Badge
                key={`${f.field}-${f.operator}-${i}`}
                variant="outline"
                className="h-6 gap-1 pl-2 pr-1 text-[11px] bg-muted/60 border-border/80 text-foreground font-normal hover:border-primary/50 transition-colors"
              >
                <span className="font-medium text-muted-foreground">{fieldLabel}</span>
                <span className="text-muted-foreground text-[10px]">{opLabel}</span>
                <span className="font-semibold">{displayVal}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 ml-0.5 rounded-full hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                  onClick={() => handleRemoveSingleActiveFilter(f.field, f.operator)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </Badge>
            );
          })}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-muted-foreground hover:text-destructive px-1.5"
            onClick={handleClearAll}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
};
