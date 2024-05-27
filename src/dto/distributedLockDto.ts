import { Expose, Exclude } from "class-transformer";
import BaseDto from "./public/baseDto";

@Exclude()
export default class DistributedLockDto extends BaseDto {
  @Expose()
  public key_resource_id!: string;

  @Expose()
  public client_id!: string;

  @Expose()
  public expire!: number;
}
