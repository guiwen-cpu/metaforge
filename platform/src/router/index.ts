import { createRouter, createWebHistory } from "vue-router";
import StudioLayout from "@/layouts/StudioLayout.vue";
import AppListPage from "@/pages/AppListPage.vue";
import AppDetailPage from "@/pages/AppDetailPage.vue";
import ModelDesignerPage from "@/pages/ModelDesignerPage.vue";
import PageDesignerPage from "@/pages/PageDesignerPage.vue";
import LogicDesignerPage from "@/pages/LogicDesignerPage.vue";
import ComponentDesignerPage from "@/pages/ComponentDesignerPage.vue";
import ApprovalCenterPage from "@/pages/ApprovalCenterPage.vue";
import ApprovalDetailPage from "@/pages/ApprovalDetailPage.vue";
import InstanceDetailPage from "@/pages/InstanceDetailPage.vue";
import NotFoundView from "@/views/NotFoundView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: StudioLayout,
      children: [
        { path: "", name: "apps", component: AppListPage, meta: { title: "应用工作台" } },
        {
          path: "apps/:appId",
          name: "app-detail",
          component: AppDetailPage,
          meta: { title: "应用详情" }
        },
        {
          path: "apps/:appId/model",
          name: "app-model",
          component: ModelDesignerPage,
          meta: { title: "数据模型" }
        },
        {
          path: "apps/:appId/pages/:pageKey?",
          name: "app-pages",
          component: PageDesignerPage,
          meta: { title: "页面设计器" }
        },
        {
          path: "apps/:appId/logic",
          name: "app-logic",
          component: LogicDesignerPage,
          meta: { title: "逻辑编排" }
        },
        {
          path: "apps/:appId/components",
          name: "app-components",
          component: ComponentDesignerPage,
          meta: { title: "自定义组件" }
        },
        {
          path: "apps/:appId/approvals",
          name: "app-approvals",
          component: ApprovalCenterPage,
          meta: { title: "审批中心" }
        },
        {
          path: "apps/:appId/approvals/:taskId",
          name: "app-approval-detail",
          component: ApprovalDetailPage,
          meta: { title: "审批详情" }
        },
        {
          path: "apps/:appId/instances/:instanceId",
          name: "app-instance-detail",
          component: InstanceDetailPage,
          meta: { title: "流程实例" }
        }
      ]
    },
    { path: "/:pathMatch(.*)*", component: NotFoundView }
  ],
  scrollBehavior: () => ({ top: 0 })
});

export default router;
