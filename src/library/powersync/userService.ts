import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // UUID namespace for consistency

export const generateRandomSeed = () => Math.random().toString(36).substring(2);

export class UserService {
  private static instance: UserService;
  private currentSeed: string | null = null;
  private userId: string | null = null;

  private constructor() {
    // Don't initialize from localStorage - let useSeed hook handle that
  }

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  setSeed(seed: string | null) {
    if (seed === null) {
      this.currentSeed = null;
      this.userId = null;
      return;
    }

    this.currentSeed = seed;
    this.userId = uuidv5(seed, NAMESPACE);
  }

  getUserId(): string {
    if (!this.userId || !this.currentSeed) {
      throw new Error('Seed must be set before getting userId');
    }

    return this.userId;
  }

  getSeed(): string | null {
    return this.currentSeed;
  }
}

export const userService = UserService.getInstance();
