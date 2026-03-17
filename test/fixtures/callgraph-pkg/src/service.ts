// Fixture: exported class with this.method() calls for call graph testing
import { validateInput } from "./validator.js";

export class UserService {
  async fetch(id: string): Promise<string> {
    const cleaned = this.sanitize(id);
    const valid = this.checkInput(cleaned);
    return this.query(valid);
  }

  sanitize(id: string): string {
    return id.trim();
  }

  checkInput(id: string): string {
    // Also calls imported function
    validateInput(id);
    return id;
  }

  query = async (id: string): Promise<string> => {
    // Arrow function class field — should also be tracked
    return this.formatResult(id);
  };

  private formatResult(id: string): string {
    return `user:${id}`;
  }
}
