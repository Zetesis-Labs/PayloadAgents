import { signInAction } from "@/modules/authjs/actions";
import { auth } from "@/modules/authjs/plugins";
import { AuthStatus } from "../components/AuthStatus";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function HomePage() {
  const session = await auth();
  const user = session?.user
    ? {
      id: session.user.id!,
      email: session.user.email,
      name: session.user.name,
    }
    : null;

  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">
            Multi-Tenant Example
          </CardTitle>
          <CardDescription>
            This multi-tenant example allows you to explore multi-tenancy with
            domains and with slugs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AuthStatus user={user} signIn={signInAction} />

          <Separator />

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Domains</h2>
            <p className="text-muted-foreground">
              When you visit a tenant by domain, the domain is used to determine
              the tenant.
            </p>
            <p className="leading-7">
              For example, visiting{" "}
              <a
                href="http://gold.localhost:3000/tenant-domains/login"
                className="font-medium text-primary underline underline-offset-4 hover:no-underline"
              >
                http://gold.localhost:3000/tenant-domains/login
              </a>{" "}
              will show the tenant with the domain "gold.localhost".
            </p>
          </div>

          <Separator />

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Slugs</h2>
            <p className="text-muted-foreground">
              When you visit a tenant by slug, the slug is used to determine the
              tenant.
            </p>
            <p className="leading-7">
              For example, visiting{" "}
              <a
                href="http://localhost:3000/tenant-slugs/silver/login"
                className="font-medium text-primary underline underline-offset-4 hover:no-underline"
              >
                http://localhost:3000/tenant-slugs/silver/login
              </a>{" "}
              will show the tenant with the slug "silver".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
