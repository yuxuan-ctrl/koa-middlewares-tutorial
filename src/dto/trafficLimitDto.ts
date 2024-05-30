import { Expose, Exclude } from "class-transformer";
import BaseDto from "./public/baseDto";

@Exclude()
export default class TrafficLimitDto extends BaseDto {
  @Expose()
  public count!: number;

  @Expose()
  public timeWindow!: number;

  @Expose()
  public serviceId!: string;
}
