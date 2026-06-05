"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ServerPagination {
  currentPage: number;
  perPage: number;
  total: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: number[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  /**
   * When provided, the footer is driven by the server: `data` is the current
   * page only, and Prev/Next + the per-page selector call back to the parent
   * to refetch. The internal tanstack pagination row-model is disabled so
   * we don't double-paginate the already-sliced rows.
   */
  serverPagination?: ServerPagination;
  /** Show a subtle overlay while a refetch is in flight (server mode only). */
  loading?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 20,
  serverPagination,
  loading,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const isServer = !!serverPagination;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: isServer ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: isServer ? undefined : { pagination: { pageSize } },
    manualPagination: isServer,
    pageCount: isServer ? serverPagination.lastPage : undefined,
  });

  // Footer numbers. In server mode they come straight from the meta the
  // backend sent us; in client mode we derive from the local row model.
  let from: number;
  let to: number;
  let totalRows: number;
  let pageIndex: number;
  let pageCount: number;
  let canPrev: boolean;
  let canNext: boolean;
  if (isServer) {
    const sp = serverPagination!;
    totalRows = sp.total;
    pageIndex = sp.currentPage - 1;
    pageCount = sp.lastPage;
    from = totalRows === 0 ? 0 : (sp.currentPage - 1) * sp.perPage + 1;
    to = Math.min(sp.currentPage * sp.perPage, totalRows);
    canPrev = sp.currentPage > 1;
    canNext = sp.currentPage < sp.lastPage;
  } else {
    totalRows = data.length;
    pageIndex = table.getState().pagination.pageIndex;
    pageCount = table.getPageCount();
    from = pageIndex * pageSize + 1;
    to = Math.min((pageIndex + 1) * pageSize, totalRows);
    canPrev = table.getCanPreviousPage();
    canNext = table.getCanNextPage();
  }

  // Always render the footer in server mode (so the per-page selector +
  // total count stay visible even on a single-page result set). Client
  // mode keeps the original behavior of hiding the footer for tiny lists.
  const showFooter = isServer || pageCount > 1;

  const perPageOptions = serverPagination?.perPageOptions ?? [25, 50, 100];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border overflow-hidden shadow-sm relative">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-border">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group border-l-2 border-l-transparent transition-colors hover:bg-muted/50 hover:border-l-primary"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {isServer && loading && (
          <div className="absolute inset-0 bg-background/40 pointer-events-none" />
        )}
      </div>

      {showFooter && (
        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
              <span className="font-medium text-foreground">{totalRows}</span> results
            </span>
            {isServer && serverPagination!.onPerPageChange && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">·</span>
                <Select
                  value={String(serverPagination!.perPage)}
                  onValueChange={(val) => {
                    if (val) serverPagination!.onPerPageChange!(Number(val));
                  }}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {perPageOptions.map((opt) => (
                      <SelectItem key={opt} value={String(opt)}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>per page</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isServer) {
                  serverPagination!.onPageChange(serverPagination!.currentPage - 1);
                } else {
                  table.previousPage();
                }
              }}
              disabled={!canPrev}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {pageIndex + 1} / {Math.max(pageCount, 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isServer) {
                  serverPagination!.onPageChange(serverPagination!.currentPage + 1);
                } else {
                  table.nextPage();
                }
              }}
              disabled={!canNext}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
