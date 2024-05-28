import { Expose, Exclude } from "class-transformer";
import BaseDto from "./public/baseDto";

@Exclude()
export default class LoginDto extends BaseDto {
  @Expose()
  public username!: string;

  @Expose()
  public password!: string;
}
