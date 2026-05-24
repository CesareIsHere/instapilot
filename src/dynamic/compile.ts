import { transform } from 'sucrase';

export function compileTsx(tsxCode: string): string {
  const { code } = transform(tsxCode, {
    transforms: ['typescript', 'jsx'],
    production: true,
  });
  return code;
}

export function validateTsx(tsxCode: string): string | null {
  try {
    compileTsx(tsxCode);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
