import { faker } from '@faker-js/faker';

/**
 * Data factory utilities using Faker
 */
export class DataFactory {
  /**
   * Generate a random user object
   */
  static user() {
    return {
      id: faker.string.uuid(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      username: faker.internet.userName(),
      password: faker.internet.password({ length: 12 }),
      avatar: faker.image.avatar(),
      birthDate: faker.date.birthdate(),
      phone: faker.phone.number(),
    };
  }

  /**
   * Generate a random address
   */
  static address() {
    return {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      country: faker.location.country(),
      latitude: faker.location.latitude(),
      longitude: faker.location.longitude(),
    };
  }

  /**
   * Generate a random company
   */
  static company() {
    return {
      id: faker.string.uuid(),
      name: faker.company.name(),
      catchPhrase: faker.company.catchPhrase(),
      bs: faker.company.buzzPhrase(),
      industry: faker.commerce.department(),
      email: faker.internet.email(),
      website: faker.internet.url(),
      phone: faker.phone.number(),
    };
  }

  /**
   * Generate a random product
   */
  static product() {
    return {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price()),
      category: faker.commerce.department(),
      sku: faker.string.alphanumeric(10).toUpperCase(),
      inStock: faker.datatype.boolean(),
      image: faker.image.url(),
    };
  }

  /**
   * Generate random text
   */
  static text(sentences: number = 3) {
    return faker.lorem.sentences(sentences);
  }

  /**
   * Generate a random date in the past
   */
  static pastDate(years: number = 1) {
    return faker.date.past({ years });
  }

  /**
   * Generate a random date in the future
   */
  static futureDate(years: number = 1) {
    return faker.date.future({ years });
  }

  /**
   * Generate a random number
   */
  static number(min: number = 0, max: number = 1000) {
    return faker.number.int({ min, max });
  }

  /**
   * Generate a random boolean
   */
  static boolean() {
    return faker.datatype.boolean();
  }

  /**
   * Generate an array of items
   */
  static array<T>(generator: () => T, count: number = 5): T[] {
    return Array.from({ length: count }, generator);
  }

  /**
   * Seed the random generator for reproducible data
   */
  static seed(seed: number) {
    faker.seed(seed);
  }
}

// Export faker instance for custom usage
export { faker };
