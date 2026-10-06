import { hash, verify } from '@node-rs/argon2';

export const hashPin = (pin: string) => hash(pin);
export const verifyPin = (pinHash: string, pin: string) => verify(pinHash, pin);
