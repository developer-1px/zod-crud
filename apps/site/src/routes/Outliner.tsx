// /outliner — apps/outliner workspace 의 실제 Outliner 컴포넌트를 site 안에서 렌더.
// styles 는 outliner 패키지의 자체 CSS 를 import.

import { Outliner } from "@zod-crud/outliner";
import "@zod-crud/outliner/styles.css";

export function OutlinerPage() {
  return <Outliner />;
}
