import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import AppLayout from "@/layouts/AppLayout.vue";
import NotFound from "@/views/NotFound.vue";

/** Vite 的 glob 键与 routeOf() 产出的相对路径一一对应，改页面目录时两边一起改。 */
const pages = import.meta.glob("../pages/*/index.vue");

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "", redirect: "/employee" },
  {
    path: "employee",
    name: "LeaveApprovalEmployeeList",
    component: pages["../pages/Employee/index.vue"],
    meta: { title: "人员", entity: "employee" }
  },
  {
    path: "leave_request",
    name: "LeaveApprovalLeaveRequestList",
    component: pages["../pages/LeaveRequest/index.vue"],
    meta: { title: "请假单", entity: "leave_request" }
  },
  {
    path: "attachment",
    name: "LeaveApprovalAttachmentList",
    component: pages["../pages/Attachment/index.vue"],
    meta: { title: "附件", entity: "attachment" }
  },
      { path: ":pathMatch(.*)*", name: "NotFound", component: NotFound }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.afterEach((to) => {
  const title = typeof to.meta.title === "string" ? to.meta.title : "";
  document.title = title ? title + " · MetaForge" : "MetaForge";
});

export default router;
