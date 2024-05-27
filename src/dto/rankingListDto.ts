import { Expose, Exclude } from "class-transformer";
import BaseDto from "./public/baseDto";

@Exclude()
export default class RankingListDto extends BaseDto {
  @Expose()
  public score!: number;

  @Expose()
  public name!: string;
}
