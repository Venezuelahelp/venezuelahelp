import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";

const app = new App();
new DataStack(app, "VenezuelaHelpDataStack", {
  env: { region: "us-east-1" },
});
