// A content file's parsed data (scripts/yaml-loader.cjs). Its loader gives it
// a type: lib/liquity/event-templates.ts for content/liquity-v2/event-prose.yaml.
declare module "*.yaml" {
  const data: unknown;
  export default data;
}
