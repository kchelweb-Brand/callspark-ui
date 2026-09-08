import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Copies each column's header text onto the cells beneath it as `data-label`.
 *
 * On a phone the table stacks into rows of label/value pairs (see
 * `.responsive-table` in styles.css), and those labels come from here. Doing it
 * in one effect means every table in the app — including ones added later —
 * gets the treatment without repeating the header text on ~100 cells by hand.
 *
 * Runs after every render rather than once: the rows change whenever the data
 * does, and new rows arrive without their labels.
 */
function useColumnLabels(ref: React.RefObject<HTMLTableElement | null>) {
  React.useEffect(() => {
    const table = ref.current;
    if (!table) return;

    const labels = Array.from(table.querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim() ?? "",
    );
    if (labels.length === 0) return;

    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.children);
      // A row that doesn't line up with the header is something else — an
      // empty state or a spanning message — and labelling it would be wrong.
      if (cells.length !== labels.length) continue;
      cells.forEach((cell, i) => {
        if (labels[i]) cell.setAttribute("data-label", labels[i]);
      });
    }
  });
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const inner = React.useRef<HTMLTableElement | null>(null);
    useColumnLabels(inner);

    return (
      <div className="relative w-full overflow-auto">
        <table
          ref={(node) => {
            inner.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          className={cn("responsive-table w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
