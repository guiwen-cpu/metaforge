FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /src
COPY bff/maven-settings.xml /root/.m2/settings.xml
COPY bff/pom.xml bff/pom.xml
RUN mvn -q -f bff/pom.xml -B dependency:go-offline
COPY bff bff
COPY codegen/leave_approval/api codegen/leave_approval/api
COPY schema/expression-registry.json schema/expression-registry.json
RUN mvn -q -f bff/pom.xml -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN adduser -D -H -u 10002 app
WORKDIR /app
COPY --from=build /src/bff/target/bff.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Duser.timezone=Asia/Shanghai"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
