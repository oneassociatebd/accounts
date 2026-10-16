import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listCustomers,
  toggleCustomer,
  listLocations,
  listAreas,
  listReferences,
} from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Eye,
  Power,
  Users,
  FileText,
  Receipt,
  Wallet,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [{ title: "One | Customers" }],
  }),
  component: CustomerList,
});

const PAGE_SIZE = 20;

type CustomerRow = {
  id: string;
  company_name?: string | null;
  name?: string | null;
  proprietor_name?: string | null;
  bin_number?: string | null;
  mobile?: string | null;
  opening_balance_amount?: number | string | null;
  opening_balance_type?: "ADVANCE" | "DUE" | null;
  is_active?: boolean | null;
  area?: { area_name?: string | null; location?: { location_name?: string | null } | null } | null;
  ref?: { reference_name?: string | null } | null;
};

function CustomerList() {
  const fetchAll = useServerFn(listCustomers);
  const fetchLocations = useServerFn(listLocations);
  const fetchAreas = useServerFn(listAreas);
  const fetchReferences = useServerFn(listReferences);
  const toggle = useServerFn(toggleCustomer);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [areaId, setAreaId] = useState<string>("all");
  const [referenceId, setReferenceId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      location_id: locationId === "all" ? null : locationId,
      area_id: areaId === "all" ? null : areaId,
      reference_id: referenceId === "all" ? null : referenceId,
      status,
      page,
      page_size: PAGE_SIZE,
    }),
    [search, locationId, areaId, referenceId, status, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["customers", filters],
    queryFn: () => fetchAll({ data: filters }),
    placeholderData: keepPreviousData,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => fetchLocations(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => fetchAreas(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: references = [] } = useQuery({
    queryKey: ["references"],
    queryFn: () => fetchReferences(),
    staleTime: 5 * 60 * 1000,
  });

  const filteredAreas = useMemo(() => {
    const list = areas as Array<{ id: string; area_name: string; location_id: string }>;
    if (locationId === "all") return list;
    return list.filter((a) => a.location_id === locationId);
  }, [areas, locationId]);

  const rows = (data?.rows ?? []) as CustomerRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleToggle = async (id: string, is_active: boolean) => {
    try {
      await toggle({ data: { id, is_active } });
      toast.success(is_active ? "Customer enabled" : "Customer disabled");
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage all customers</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search & Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 items-end">
            <div className="sm:col-span-2 lg:col-span-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search BIN, company name, mobile..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select
              value={locationId}
              onValueChange={(v) => {
                setLocationId(v);
                setAreaId("all");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations as Array<{ id: string; location_name: string }>).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.location_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={areaId}
              onValueChange={(v) => {
                setAreaId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {filteredAreas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.area_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={referenceId}
              onValueChange={(v) => {
                setReferenceId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Reference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All references</SelectItem>
                {(references as Array<{ id: string; reference_name: string }>).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.reference_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as typeof status);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden min-w-0">
        <CardHeader>
          <CardTitle>
            Customer List{" "}
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({total})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={6} cols={9} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No customers found.
            </div>
          ) : (
            <>
              <div className="w-full max-w-full overflow-auto max-h-[70vh] relative">
                <table className="w-full min-w-[920px] caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="w-12 whitespace-nowrap">#</TableHead>
                      <TableHead className="whitespace-nowrap">Company Name</TableHead>
                      <TableHead className="whitespace-nowrap">BIN</TableHead>
                      <TableHead className="whitespace-nowrap">Mobile</TableHead>
                      <TableHead className="whitespace-nowrap">Area</TableHead>
                      <TableHead className="whitespace-nowrap">Reference</TableHead>
                      <TableHead className="text-right whitespace-nowrap w-[100px]">
                        Balance
                      </TableHead>
                      <TableHead className="whitespace-nowrap w-[90px]">Status</TableHead>
                      <TableHead className="w-12 text-center whitespace-nowrap">More</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c, idx) => {
                      const balanceAmt = Number(c.opening_balance_amount ?? 0);
                      const absBalance = Math.abs(balanceAmt);
                      const balanceStr =
                        absBalance === 0
                          ? "0.00"
                          : c.opening_balance_type === "ADVANCE"
                            ? `+${absBalance.toFixed(2)}`
                            : `-${absBalance.toFixed(2)}`;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {(page - 1) * PAGE_SIZE + idx + 1}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            <Link
                              to="/customers/$id"
                              params={{ id: c.id }}
                              className="hover:underline"
                            >
                              {c.company_name || c.name}
                            </Link>
                            {c.proprietor_name && (
                              <div className="text-xs text-muted-foreground">
                                {c.proprietor_name}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{c.bin_number || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.mobile || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {c.area?.area_name
                              ? `${c.area.area_name}${c.area.location?.location_name ? ` (${c.area.location.location_name})` : ""}`
                              : "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {c.ref?.reference_name || "-"}
                          </TableCell>
                          <TableCell
                            className={`text-right whitespace-nowrap w-[100px] ${
                              c.opening_balance_type === "ADVANCE"
                                ? "text-green-600"
                                : c.opening_balance_type === "DUE"
                                  ? "text-destructive"
                                  : ""
                            }`}
                          >
                            {balanceStr}
                          </TableCell>
                          <TableCell className="w-[90px]">
                            <Badge variant={c.is_active ? "default" : "secondary"}>
                              {c.is_active ? "Active" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-12 text-center whitespace-nowrap">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open customer actions menu">
                                  <MoreHorizontal className="h-4 w-4" />

                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    navigate({ to: "/customers/$id", params: { id: c.id } })
                                  }
                                >
                                  <Eye className="h-4 w-4 mr-2" /> View Details
                                </DropdownMenuItem>
                                {role === "admin" && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleToggle(c.id, !c.is_active)}
                                    >
                                      <Power className="h-4 w-4 mr-2" />
                                      {c.is_active ? "Disable" : "Enable"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        navigate({
                                          to: "/customers/$id",
                                          params: { id: c.id },
                                          hash: "managers",
                                        })
                                      }
                                    >
                                      <Users className="h-4 w-4 mr-2" /> Assign Manager
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    navigate({
                                      to: "/ledger/customer",
                                      search: { customer_id: c.id },
                                    })
                                  }
                                >
                                  <Wallet className="h-4 w-4 mr-2" /> View Ledger
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => toast.info("Bills module coming soon")}
                                >
                                  <FileText className="h-4 w-4 mr-2" /> View Bills
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => toast.info("Collections module coming soon")}
                                >
                                  <Receipt className="h-4 w-4 mr-2" /> View Collections
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
                      « First
                    </Button>
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-muted-foreground">Go to</span>
                      <Input
                        type="number"
                        min={1}
                        max={totalPages}
                        defaultValue={page}
                        key={page}
                        className="h-8 w-16"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const n = Math.min(totalPages, Math.max(1, Number((e.target as HTMLInputElement).value) || 1));
                            setPage(n);
                          }
                        }}
                        onBlur={(e) => {
                          const n = Math.min(totalPages, Math.max(1, Number(e.target.value) || 1));
                          if (n !== page) setPage(n);
                        }}
                      />
                    </div>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                      Last »
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
