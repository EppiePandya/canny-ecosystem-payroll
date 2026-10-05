import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";

type SiteMetaCardProps = {
  projectId: string | null;
  companyId: string | null;
  capacity?: number | null;
};

export function SiteMetaCard({
  projectId,
  companyId,
  capacity,
}: SiteMetaCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Details</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Project ID</p>
          <p className="font-mono break-all">{projectId}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Company ID</p>
          <p className="font-mono break-all">{companyId}</p>
        </div>

        {capacity !== null && capacity !== undefined && (
          <div>
            <p className="text-muted-foreground">Capacity</p>
            <p>{capacity}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
