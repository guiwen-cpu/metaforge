import { createRouter, createWebHistory } from "vue-router";
import StudioLayout from "@/layouts/StudioLayout.vue";
import AppListPage from "@/pages/AppListPage.vue";
import AppDetailPage from "@/pages/AppDetailPage.vue";
import ModelDesignerPage from "@/pages/ModelDesignerPage.vue";
import PageDesignerPage from "@/pages/PageDesignerPage.vue";
import LogicDesignerPage from "@/pages/LogicDesignerPage.vue";
import ComponentDesignerPage from "@/pages/ComponentDesignerPage.vue";
import RuntimeShellPage from "@/pages/RuntimeShellPage.vue";
import ApprovalCenterPage from "@/pages/ApprovalCenterPage.vue";
import ApprovalDetailPage from "@/pages/ApprovalDetailPage.vue";
import InstanceDetailPage from "@/pages/InstanceDetailPage.vue";
import LoginPage from "@/pages/LoginPage.vue";
import SsoCallbackPage from "@/pages/SsoCallbackPage.vue";
import IdentityPage from "@/pages/IdentityPage.vue";
import ConnectionsPage from "@/pages/ConnectionsPage.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import { session } from "@/lib/session";

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
          path: "apps/:appId/runtime",
          name: "app-runtime",
          component: RuntimeShellPage,
          meta: { title: "运行预览" }
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
        },
        {
          path: "identity",
          name: "identity",
          component: IdentityPage,
          meta: { title: "组织与权限" }
        },
        {
          path: "connections",
          name: "connections",
          component: ConnectionsPage,
          meta: { title: "集成连接" }
        }
      ]
    },
    {
      path: "/login",
      name: "login",
      component: LoginPage,
      meta: { title: "登录", public: true }
    },
    {
      path: "/sso/callback",
      name: "sso-callback",
      component: SsoCallbackPage,
      meta: { title: "统一身份登录", public: true }
    },
    { path: "/:pathMatch(.*)*", component: NotFoundView }
  ],
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach((to) => {
  if (to.meta.public === true) {
    if (to.name === "login" && session.isAuthenticated()) {
      return { name: "apps" };
    }
    return true;
  }
  if (!session.isAuthenticated()) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
