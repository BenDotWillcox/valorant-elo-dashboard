# New Schema Instructions

Use this guide to create a new schema for the project.

Write the complete code for every step. Do not get lazy. Write everything that is needed.

Your goal is to completely finish the new schema.

## Steps

1. Create a new schema file in `/db/schema` like `example-schema.ts`
2. Export the new schema in `/db/schema/index.ts` @schema/index.ts
3. Add the new schema to the database in `/db/db.ts` @db.ts
4. Add the queries for the new schema in `/db/queries` like `example-queries.ts`
5. Add the actions for the new schema in `/actions` like `example-actions.ts`
6. Generate the new schema with `db:generate`
7. Migrate the new schema with `db:migrate`
