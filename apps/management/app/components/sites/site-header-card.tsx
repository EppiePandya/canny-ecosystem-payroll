import { Badge } from "@canny_ecosystem/ui/badge";

import { Card, CardHeader, CardTitle } from "@canny_ecosystem/ui/card";

type SiteHeaderCardProps = {
  name: string;
  isActive: boolean;
};

export function SiteHeaderCard({ name, isActive }: SiteHeaderCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl">{name}</CardTitle>
        </div>

        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "Active" : "Inactive"}
        </Badge>
      </CardHeader>
    </Card>
  );
}
