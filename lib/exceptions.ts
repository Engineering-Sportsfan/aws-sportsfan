export class BadRequestException extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestException';
  }
}

export class NotFoundException extends Error {
  status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}
