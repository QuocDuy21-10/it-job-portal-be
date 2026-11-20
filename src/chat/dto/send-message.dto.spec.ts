import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from './send-message.dto';

const errorsFor = async (body: object) =>
  (await validate(plainToInstance(SendMessageDto, body))).map(error => error.property);

describe('SendMessageDto clientMessageId', () => {
  it('accepts a UUID or no value', async () => {
    expect(
      await errorsFor({ message: 'hi', clientMessageId: '3f1c2b8e-9a4d-4c1e-8f2a-1b2c3d4e5f60' }),
    ).toEqual([]);
    expect(await errorsFor({ message: 'hi' })).toEqual([]);
  });

  it('rejects a non-UUID value', async () => {
    expect(await errorsFor({ message: 'hi', clientMessageId: 'test-id' })).toEqual([
      'clientMessageId',
    ]);
  });
});
