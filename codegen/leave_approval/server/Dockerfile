FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /src
COPY server/pom.xml server/pom.xml
RUN mvn -q -f server/pom.xml -B dependency:go-offline
COPY api api
COPY server/src server/src
RUN mvn -q -f server/pom.xml -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN adduser -D -H -u 10002 app
WORKDIR /app
COPY --from=build /src/server/target/leave_approval-server.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Duser.timezone=Asia/Shanghai"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
