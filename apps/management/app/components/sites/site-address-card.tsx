import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";

type SiteAddressCardProps = {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  pincode: string;
  companyLocationName?: string;
};

export function SiteAddressCard({
  addressLine1,
  addressLine2,
  city,
  state,
  pincode,
  companyLocationName,
}: SiteAddressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Address</CardTitle>
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        <p>{addressLine1}</p>
        {addressLine2 && <p>{addressLine2}</p>}

        <p>
          {city}, {state} – {pincode}
        </p>

        {companyLocationName && (
          <p className="text-muted-foreground">
            Company Location: {companyLocationName}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
