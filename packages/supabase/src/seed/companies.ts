import { faker } from "@faker-js/faker";
import type {
  CompanyDatabaseInsert,
  LocationDatabaseInsert,
  RelationshipDatabaseInsert,
} from "../types";

export function seedCompany(): CompanyDatabaseInsert {
  const companyName = faker.company.name();
  return {
    name: companyName,
    email_suffix: `${companyName.toLowerCase()}.${faker.internet.domainSuffix()}`,
    company_size: ["small", "medium", "enterprise"][
      faker.number.int({ min: 0, max: 2 })
    ],
    company_type: ["sub_contractor", "project_client", "end_client"][
      faker.number.int({ min: 0, max: 2 })
    ],
    is_active: [true, false][faker.number.int({ min: 0, max: 1 })],
  };
}

export function seedCompanyLocations(): Omit<
  LocationDatabaseInsert,
  "company_id"
> {
  return {
    name: faker.string.alpha(10),
    is_primary: true,
    address_line_1: faker.location.streetAddress(),
    address_line_2: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    pincode: faker.location.zipCode(),
    latitude: faker.location.latitude(),
    longitude: faker.location.longitude(),
  };
}

export function seedCompanyRelationships(): Omit<
  RelationshipDatabaseInsert,
  "company_id"
> {
  return {
    relationship_type: faker.string.alpha(10),
    is_active: [true, false][faker.number.int({ min: 0, max: 1 })],
  };
}
