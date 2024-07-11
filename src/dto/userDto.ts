import { Expose, Exclude } from "class-transformer";
import BaseDto from "./public/baseDto";

@Exclude()
export default class UserDto extends BaseDto {
  @Expose()
  public name!: string;

  @Expose()
  public email!: string;
}
