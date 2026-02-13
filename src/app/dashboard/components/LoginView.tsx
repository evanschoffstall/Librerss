import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const LoginView = () => (
  <div className="mx-auto max-w-md px-4 py-14">
    <Card>
      <CardHeader>
        <CardTitle>Sign in to LibreRSS</CardTitle>
        <CardDescription>Access your saved feeds and reading preferences.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input type="email" placeholder="Email address" />
        <Input type="password" placeholder="Password" />
        <Button className="w-full">Continue</Button>
        <Button variant="link" className="px-0">Need help signing in?</Button>
      </CardContent>
    </Card>
  </div>
);
